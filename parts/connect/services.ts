import type { Caller } from '../core/index.ts'
import { TentError } from '../core/index.ts'
import { fromJsonSchema, isStored } from '../core/internal.ts'
import { answerOf } from './answered.ts'
import { callInput } from './callInput.ts'
import type { Renewals } from './connection.ts'
import { connectionOf } from './connection.ts'
import type { Answered } from './mcp/client.ts'
import type { OutsideTool } from './mcp/env.ts'
import { outsideOf } from './outside.ts'
import type { ConnectEnv } from './env.ts'
import type { Stored } from './requestOf.ts'
import { requestOf } from './requestOf.ts'
import { authAdded } from './auth.ts'
import { tried } from './tries.ts'
import type { Turns } from './turns.ts'
import { turnsOf } from './turns.ts'

/** Who a service call is made for: its caller, the version it runs on, whose account it uses, and what ends it. */
interface CallFor {
  caller: Caller
  version: string
  for?: string
  account?: string
  signal: AbortSignal
  // A call whose turn was taken elsewhere: a worker's call, whose limits its writer counted at its `may`.
  counted?: true
  // Told the whole answer before it is filtered through the output: a model over the call reads what it used there.
  seen?: (whole: unknown) => void
  // The call of a tool step of an outside server, answered `{ result, files }`, the pictures and sounds kept as files.
  files?: true
  // Of a tool of an outside server: the answer to what it asked for, the person's from the ask of the step alone.
  answered?: Answered
  // Of a tool of an outside server: the run it is called in, for a server whose session is kept for a run.
  run?: string
}

/** The services of an app, as `connect` makes their calls. */
export interface AppServices {
  call(service: string, call: string, input: unknown, o: CallFor): Promise<unknown>
  // The tools of an outside MCP server, as its server lists them now: with the connection of a user for `oauth`.
  tools(service: string, o: { version: string; for?: string; account?: string }): Promise<OutsideTool[]>
  // Waits for a turn of a service under its limits, and counts it: what a worker's call is counted by. Answers what frees it.
  turn(service: string, version: string, signal: AbortSignal): Promise<() => void>
}

// The turns of a call that was counted elsewhere: it waits for nothing here.
const elsewhere: Turns = { take: async () => () => undefined }

/** The error of a name that is no call of a service of the version. */
const noCall = (name: string): TentError =>
  new TentError('T0001', `No call named ${JSON.stringify(name).slice(0, 80)} of a service can be reached.`, {
    fix: 'Call a service by a call that its definition names.',
  })

/**
 * Takes what the engine hands `connect`. Answers the services of an app: `call` checks the input of a call against
 * its types (T0002), builds its request, puts the auth on it, waits its turn under the limits of its service,
 * sends it through the guarded fetch, tries it again where that is safe, reads the answer, and writes one row of
 * the log. A stand-in that the engine names is asked in place of sending. What it throws is in `tries.ts` and
 * `answered.ts`: T7115, T7116, T0019, T0022 and the reason of the signal.
 */
export function createServices(env: ConnectEnv): AppServices {
  const turns = new Map<string, Turns>()
  const renewals: Renewals = new Map()
  const outside = outsideOf(env, renewals)
  /** The turns of a service, made at its first call: its limits are counted for it, in memory. */
  const turnsFor = (service: string, stored: Stored): Turns => {
    const held = turns.get(service)
    if (held) return held
    const limits = isStored(stored.limits) ? stored.limits : {}
    const bound = (value: unknown): number | undefined => (typeof value === 'number' ? value : undefined)
    const made = turnsOf(env, {
      ...(bound(limits.perSecond) === undefined ? {} : { perSecond: bound(limits.perSecond) }),
      ...(bound(limits.perMinute) === undefined ? {} : { perMinute: bound(limits.perMinute) }),
      ...(bound(limits.atOnce) === undefined ? {} : { atOnce: bound(limits.atOnce) }),
    })
    turns.set(service, made)
    return made
  }
  return {
    async call(service, callName, given, o) {
      const name = `${service}.${callName}`
      const description = env.description(o.version)
      const stored = Object.hasOwn(description.services, service) ? description.services[service] : undefined
      const calls = isStored(stored?.calls) ? stored.calls : {}
      const call = Object.hasOwn(calls, callName) ? calls[callName] : undefined
      if (!stored || !isStored(call)) throw noCall(name)
      // A tool of an outside MCP server is called over the standard, with the input its schema takes.
      if (stored.mcp && !env.standIn?.(service))
        return outside.call(service, stored, callName, given, {
          ...o,
          turns: o.counted ? elsewhere : turnsFor(service, stored),
        })
      // The fields of a tool of an outside server are those its approval wrote into the lock file.
      const locked = stored.mcp ? fromJsonSchema(call.schema) : undefined
      const input = callInput(name, locked ? (locked.kind === 'object' ? locked.shape : {}) : call.input, given)
      // A call of a user's own connection needs that connection, also where a stand-in answers it.
      const auth = isStored(stored.auth) ? stored.auth : {}
      const connected =
        auth.oauth !== undefined || (typeof stored.connection === 'string' && stored.connection !== '')
          ? await connectionOf(env, renewals, {
              service,
              version: o.version,
              caller: o.caller,
              ...(o.for === undefined ? {} : { for: o.for }),
              ...(o.account === undefined ? {} : { account: o.account }),
            })
          : undefined
      const standIn = env.standIn?.(service)
      if (standIn) {
        const asked: unknown = Reflect.get(standIn, callName)
        const answer =
          typeof asked === 'function' ? await Reflect.apply(asked, standIn, [input, { once: env.once() }]) : asked
        const read = await answerOf(
          env,
          name,
          call,
          answer === undefined ? new Response(null) : Response.json(answer),
          o.caller,
          o.seen,
        )
        // A tool step of an outside server is answered as the server's own call answers it, with no file kept.
        return stored.mcp && o.files ? { result: read, files: [] } : read
      }
      const planned = await requestOf(env, service, stored, callName, call, input, o.caller)
      authAdded(env, stored, planned)
      if (connected) planned.headers.set('Authorization', `Bearer ${connected.access}`)
      const once = env.once()
      if (once !== undefined && typeof stored.onceOnlyHeader === 'string')
        planned.headers.set(stored.onceOnlyHeader, once)
      return tried(env, {
        name,
        service,
        callName,
        stored,
        call,
        planned,
        once: once !== undefined && typeof stored.onceOnlyHeader === 'string',
        turns: o.counted ? elsewhere : turnsFor(service, stored),
        caller: o.caller,
        signal: o.signal,
        ...(connected ? { again: () => connected.again() } : {}),
        ...(o.seen ? { seen: o.seen } : {}),
      })
    },
    async turn(service, version, signal) {
      const description = env.description(version)
      const stored = Object.hasOwn(description.services, service) ? description.services[service] : undefined
      if (!stored) throw noCall(service)
      return turnsFor(service, stored).take(signal)
    },
    async tools(service, o) {
      const description = env.description(o.version)
      const stored = Object.hasOwn(description.services, service) ? description.services[service] : undefined
      if (!stored?.mcp)
        throw new TentError('T0001', `${JSON.stringify(service).slice(0, 80)} is no outside MCP server of the app.`, {
          fix: 'Name a service that states `mcp`.',
        })
      return outside.tools(service, stored, { caller: { kind: 'system' }, ...o, turns: turnsFor(service, stored) })
    },
  }
}
