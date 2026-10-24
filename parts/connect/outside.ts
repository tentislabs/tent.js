import type { Caller } from '../core/index.ts'
import { TentError } from '../core/index.ts'
import { isStored } from '../core/internal.ts'
import type { Connected, Renewals } from './connection.ts'
import { connectionOf } from './connection.ts'
import type { ConnectEnv } from './env.ts'
import type { Answered, McpClient } from './mcp/client.ts'
import { mcpClient } from './mcp/client.ts'
import type { OutsideTool } from './mcp/env.ts'
import { outsideAnswer } from './mcp/outsideAnswer.ts'
import type { Stored } from './requestOf.ts'
import { valueOf } from './requestOf.ts'
import { answerCaps } from './guardedFetch.ts'
import { authAdded, signerRan } from './auth.ts'
import type { Turns } from './turns.ts'

/** Who a call of an outside tool is made for, what ends it, and the turns of its service it waits under. */
interface OutsideFor {
  caller: Caller
  version: string
  for?: string
  account?: string
  signal: AbortSignal
  turns: Turns
  // The call of a tool step, which is answered `{ result, files }`: the files are what the step's result holds.
  files?: true
  // The answer to what the server asked for: the person's from the ask of the step, or the named model's.
  answered?: Answered
  // The run the call is made in, for a server whose session is kept for the length of a run.
  run?: string
}

/** Who the tools of an outside server are asked for, and the turns of its service the asking waits under. */
type ToolsFor = Omit<OutsideFor, 'signal' | 'files' | 'answered' | 'run'>

// How long a session kept for a run stands after its last use: a run that went on longer opens a new one.
const sessionKept = 600_000

/** The calls of the outside MCP servers of an app: the tools of one, and a call of one of its tools. */
export interface Outside {
  tools(service: string, stored: Stored, o: ToolsFor): Promise<OutsideTool[]>
  call(service: string, stored: Stored, tool: string, input: unknown, o: OutsideFor): Promise<unknown>
}

/** T7112: a tool of an outside server that is not as it was approved, which is held back by itself. */
const heldBack = (service: string, tool: string): TentError =>
  new TentError('T7112', `The tool ${tool} of ${service} is not as it was approved, and is held back.`, {
    fix: `Look at it again with \`tent mcp approve ${service}\`, and build and run the version that holds it.`,
  })

/**
 * Takes what the engine hands `connect` and the renewals under way. Answers the calls of the outside MCP servers:
 * each is asked through a client of its own address, through the service layer, or over the channel to its
 * program; the form each speaks is remembered. A call waits its turn under the limits of its service and writes
 * one row of the log.
 */
export function outsideOf(env: ConnectEnv, renewals: Renewals): Outside {
  const forms = new Map<string, 'newest' | 'older'>()
  const overChannels = new WeakMap<object, McpClient>()
  const sessions = new Map<string, { lines: Promise<Record<string, string>>; timer: NodeJS.Timeout }>()

  /** The session of a server kept for one run, with `mcp: { keep: 'run' }`, dropped once it was not used for a while. */
  function keptFor(service: string, run: string) {
    const key = `${service}\u0000${run}`
    const drop = (): void => {
      clearTimeout(sessions.get(key)?.timer)
      sessions.delete(key)
    }
    return {
      hold(open: () => Promise<Record<string, string>>): Promise<Record<string, string>> {
        const found = sessions.get(key)
        const lines = found?.lines ?? open()
        clearTimeout(found?.timer)
        const timer = setTimeout(() => sessions.delete(key), sessionKept)
        timer.unref()
        sessions.set(key, { lines, timer })
        // An opening that fails is not kept: the next call opens again.
        lines.catch(() => (sessions.get(key)?.lines === lines ? drop() : undefined))
        return lines
      },
      drop,
    }
  }

  /**
   * What sends a request of a client to its server through the service layer: the service's `headers` and
   * auth are put on it, the connection's token for `oauth`, renewed once after an answer of 401 and sent once
   * more, and a signer of the builder's own runs last. `heard` is told the status of each answer.
   */
  function layered(
    service: string,
    stored: Stored,
    connected: Connected | undefined,
    user: string | undefined,
    heard: (status: number) => void,
  ) {
    return async (request: Request, init: { size: number; time: number; signal: AbortSignal }): Promise<Response> => {
      const body = await request.arrayBuffer()
      const planned = { url: new URL(request.url), method: request.method, headers: new Headers(request.headers) }
      for (const [name, value] of Object.entries(isStored(stored.headers) ? stored.headers : {}))
        planned.headers.set(name, valueOf(env, value))
      authAdded(env, stored, planned)
      let access = connected?.access
      for (let renewed = false; ; renewed = true) {
        if (access !== undefined) planned.headers.set('Authorization', `Bearer ${access}`)
        const made = new Request(planned.url, { method: planned.method, headers: planned.headers, body })
        const answer = await env.fetch(await signerRan(env, stored, service, made, user), init)
        heard(answer.status)
        if (answer.status !== 401 || renewed || !connected) return answer
        access = await connected.again()
        // With no renewal token the 401 stands, as the failure of the call.
        if (access === undefined) return answer
        await answer.body?.cancel()
      }
    }
  }

  async function clientOf(
    service: string,
    stored: Stored,
    o: { caller: Caller; version: string; for?: string; account?: string; run?: string },
    heard: (status: number) => void,
  ): Promise<McpClient> {
    const limits = isStored(stored.limits) ? stored.limits : {}
    const keeps = isStored(stored.mcp) && stored.mcp.keep === 'run' && o.run !== undefined
    const bounds = {
      timeout: typeof limits.time === 'number' ? limits.time : answerCaps.time,
      size: typeof limits.size === 'number' ? limits.size : answerCaps.size,
      form: { get: () => forms.get(service), set: (form: 'newest' | 'older') => void forms.set(service, form) },
      ...(keeps && o.run !== undefined ? { session: keptFor(service, o.run) } : {}),
    }
    const user = o.for ?? o.caller.user?.id
    if (isStored(stored.mcp) && stored.mcp.command !== undefined) {
      const channel = env.channel?.(service, user)
      if (!channel) throw new TentError('T7115', `The program of ${service} is not running.`)
      // One client speaks over one channel, so that the numbers of its requests never meet.
      const kept = overChannels.get(channel) ?? mcpClient({ channel, ...bounds })
      overChannels.set(channel, kept)
      return kept
    }
    const auth = isStored(stored.auth) ? stored.auth : {}
    const connected =
      auth.oauth !== undefined || (typeof stored.connection === 'string' && stored.connection !== '')
        ? await connectionOf(env, renewals, { service, ...o })
        : undefined
    return mcpClient({ url: String(stored.url), fetch: layered(service, stored, connected, user, heard), ...bounds })
  }

  return {
    async tools(service, stored, o) {
      const done = await o.turns.take(AbortSignal.timeout(answerCaps.time))
      try {
        return await (await clientOf(service, stored, o, () => undefined)).tools()
      } finally {
        done()
      }
    },
    async call(service, stored, tool, input, o) {
      if (env.held?.(service, tool)) throw heldBack(service, tool)
      const began = env.now()
      let status: number | undefined
      const done = await o.turns.take(o.signal)
      try {
        const client = await clientOf(service, stored, o, (heard) => {
          status = heard
        })
        const { value, held } = outsideAnswer(await client.call(tool, input, o.signal, o.answered))
        if (!o.files) return value
        // A picture or a sound is kept as a file, of the kind its bytes say, whatever the server says it is.
        const files: { id: string; kind: string }[] = []
        for (const [at, one] of held.entries()) {
          const bytes = new Blob([new Uint8Array(one.bytes)]).stream()
          const id = await env.files.put(bytes, { name: `${tool}-${at + 1}`, kind: one.said }, { caller: o.caller })
          files.push({ id, kind: env.files.info(id, o.caller).kind })
        }
        return { result: value, files }
      } finally {
        done()
        env.logged({ service, call: tool, ...(status === undefined ? {} : { status }), ms: env.now() - began })
      }
    },
  }
}
