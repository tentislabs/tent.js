import { TentError } from '../core/index.ts'
import type { App } from '../engine/index.ts'
import { adminTokenOf } from './adminToken.ts'
import type { TestCaller } from './as.ts'

// The client's own words of the standard. They are the other side of the layer, which a test holds it against,
// so they are written here and not read from the layer.
const newest = '2026-07-28'
const versionKey = 'io.modelcontextprotocol/protocolVersion'
const canKey = 'io.modelcontextprotocol/clientCapabilities'
const clientKey = 'io.modelcontextprotocol/clientInfo'
const clientInfo = { name: 'tent-test', version: '1' }

/**
 * Whom a client of a test is: a caller, by the admin token and `Tent-Caller` as a command of this computer sends
 * one; a token, as a key and the token of a grant are sent; or the lines of a request of the test's own.
 */
export type McpAs = TestCaller | { token: string } | { headers: Record<string, string> }

/** What `app.mcp` takes: whom the client is, the version of the standard it speaks, and whether it can ask its person. */
export interface McpAsked {
  as?: McpAs
  form?: string
  asks?: boolean
}

/** What a request of the client was answered: its status, its lines, and its body read as JSON. */
export interface McpReply {
  status: number
  headers: Headers
  body: Record<string, unknown>
}

/** A kept stream that the client opened: the type of its answer, and each message of it in turn. */
export interface McpListening {
  status: number
  kind: string
  next(): Promise<Record<string, unknown>>
  close(): void
}

/** A client of MCP joined to a test app with no network. */
export interface TestMcp {
  readonly form: string
  /** What the server says of itself: the answer of the opening of an older form, or of the newest form's own request. */
  hello(): Promise<Record<string, unknown>>
  /** The tools that the client is listed. */
  tools(): Promise<Record<string, unknown>[]>
  /** Calls a tool, and answers the answer of the tool. Throws where the request is answered no answer of a tool. */
  call(name: string, input?: unknown, params?: Record<string, unknown>): Promise<Record<string, unknown>>
  /** Sends one request of the standard in the client's form, and answers what it was answered. */
  request(method: string, params?: Record<string, unknown>, o?: { headers?: Record<string, string> }): Promise<McpReply>
  /** Sends a body as it is, with the lines of the client, and answers what it was answered. */
  send(body: unknown, o?: { headers?: Record<string, string>; method?: string }): Promise<McpReply>
  /** Opens the kept stream of the client: a `GET` in an older form, the standard's own listening request in the newest. */
  listen(): Promise<McpListening>
}

/** Reads the body of an answer as JSON, and as an empty record where it holds none. */
async function bodyOf(answer: Response): Promise<Record<string, unknown>> {
  const text = await answer.text()
  if (text === '') return {}
  try {
    return Object(JSON.parse(text))
  } catch {
    return { text }
  }
}

/** Reads the events of a kept stream one message at a time. */
function eventsOf(answer: Response): McpListening {
  const reader = answer.body?.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const next = async (): Promise<Record<string, unknown>> => {
    for (;;) {
      const end = buffer.indexOf('\n\n')
      if (end >= 0) {
        const event = buffer.slice(0, end)
        buffer = buffer.slice(end + 2)
        const data = event
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trim())
          .join('\n')
        if (data) return Object(JSON.parse(data))
        continue
      }
      const part = await reader?.read()
      if (!part || part.done) throw new TentError('T0013', 'The kept stream ended.')
      buffer += decoder.decode(part.value, { stream: true })
    }
  }
  return {
    status: answer.status,
    kind: (answer.headers.get('content-type') ?? '').split(';')[0],
    next,
    close: () => void reader?.cancel().catch(() => undefined),
  }
}

/**
 * `app.mcp({ as, form, asks })`: a client of MCP, joined to the test app with no network, in the newest form or
 * in the older one that `form` names. A client of an older form opens with the standard's opening request at its
 * first request, and names its version in its line after that.
 */
export const mcp =
  (app: () => App, dataFolder: () => string) =>
  (asked: McpAsked = {}): TestMcp => {
    const form = asked.form ?? newest
    let opened: Promise<Record<string, unknown>> | undefined
    let ids = 0
    const lines = (): Record<string, string> => {
      const as = asked.as
      if (as === undefined) return {}
      if (typeof as === 'object' && 'token' in as) return { authorization: `Bearer ${as.token}` }
      if (typeof as === 'object' && 'headers' in as) return as.headers
      const token = adminTokenOf(dataFolder())
      const caller = typeof as === 'string' ? as : as.kind === 'user' ? String(as.user?.id) : as.kind
      return { authorization: `Bearer ${token}`, 'tent-caller': caller }
    }
    const sent = (body: unknown, o: { headers?: Record<string, string>; method?: string } = {}): Promise<Response> => {
      const method = o.method ?? 'POST'
      const formLines: Record<string, string> =
        form === newest
          ? { 'mcp-protocol-version': newest, ...(isMethod(body) ? { 'mcp-method': body.method } : {}) }
          : form === '2025-03-26' || !opened
            ? {}
            : { 'mcp-protocol-version': form }
      return app().request(
        new Request('http://localhost/mcp', {
          method,
          headers: {
            accept: 'application/json, text/event-stream',
            ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
            ...lines(),
            ...formLines,
            ...o.headers,
          },
          ...(body === undefined || method === 'GET' ? {} : { body: JSON.stringify(body) }),
        }),
      )
    }
    const send = async (body: unknown, o: { headers?: Record<string, string>; method?: string } = {}) => {
      const answer = await sent(body, o)
      return { status: answer.status, headers: answer.headers, body: await bodyOf(answer) }
    }
    /** The opening of an older form, once: its request and its note. */
    const open = (): Promise<Record<string, unknown>> => {
      opened ??= (async () => {
        const params = { protocolVersion: form, capabilities: asked.asks ? { elicitation: {} } : {}, clientInfo }
        const answer = await send({ jsonrpc: '2.0', id: ++ids, method: 'initialize', params })
        await send({ jsonrpc: '2.0', method: 'notifications/initialized' })
        return Object(answer.body.result)
      })()
      return opened
    }
    const request = async (
      method: string,
      params: Record<string, unknown> = {},
      o: { headers?: Record<string, string> } = {},
    ): Promise<McpReply> => {
      if (form !== newest) await open()
      const can = asked.asks ? { elicitation: {} } : {}
      const meta = form === newest ? { _meta: { [versionKey]: newest, [canKey]: can, [clientKey]: clientInfo } } : {}
      return send({ jsonrpc: '2.0', id: ++ids, method, params: { ...params, ...meta } }, o)
    }
    const resultOf = (reply: McpReply, what: string): Record<string, unknown> => {
      if (reply.status !== 200 || reply.body.result === undefined)
        throw new TentError('T0013', `${what} was answered ${reply.status}: ${JSON.stringify(reply.body)}`)
      return Object(reply.body.result)
    }
    return {
      form,
      hello: async () => (form === newest ? resultOf(await request('server/discover'), 'server/discover') : open()),
      async tools() {
        const listed = resultOf(await request('tools/list'), 'tools/list')
        return Array.isArray(listed.tools) ? listed.tools.map((one) => Object(one)) : []
      },
      call: async (name, input = {}, params = {}) =>
        resultOf(await request('tools/call', { name, arguments: input, ...params }), `the call of ${name}`),
      request,
      send,
      async listen() {
        if (form === newest) {
          const meta = { [versionKey]: newest, [canKey]: {}, [clientKey]: clientInfo }
          return eventsOf(
            await sent({ jsonrpc: '2.0', id: ++ids, method: 'subscriptions/listen', params: { _meta: meta } }),
          )
        }
        await open()
        return eventsOf(await sent(undefined, { method: 'GET' }))
      },
    }
  }

/** Whether a body is one message that names its method. */
const isMethod = (body: unknown): body is { method: string } =>
  typeof body === 'object' && body !== null && typeof Reflect.get(body, 'method') === 'string'
