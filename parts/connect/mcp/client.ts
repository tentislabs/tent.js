import { TentError } from '../../core/index.ts'
import { fingerprintOf, isStored, written } from '../../core/internal.ts'
import { eventsOf } from '../events.ts'
import type { OutsideTool } from './env.ts'
import { holdCall, isHeldState, questionInState, takeCall } from './held.ts'
import { headers, meta, methods, moreNeeded, newest, older } from './standard.ts'

/** What a program that is a server is spoken to over: messages sent and messages heard, and its end. */
export interface Channel {
  send(message: object): void
  each(fn: (message: object) => void): void
  close(): void
}

/**
 * How a client reaches its server: an address with what sends a request to it, which puts the service's lines and
 * sign-in on, or a channel to a program.
 */
type Way =
  | {
      url: string
      fetch(request: Request, init: { size: number; time: number; signal: AbortSignal }): Promise<Response>
    }
  | { channel: Channel }

/** The form of the standard that a server speaks, which a client remembers between its calls. */
interface Remembered {
  get(): 'newest' | 'older' | undefined
  set(form: 'newest' | 'older'): void
}

/** The session of a server of the older form, with the lines that name it, where it is kept between calls. */
interface KeptSession {
  // The kept lines, or those that `open` makes, once for calls that ask together.
  hold(open: () => Promise<Record<string, string>>): Promise<Record<string, string>>
  // Forgets the kept session, where the server no longer knows it.
  drop(): void
}

/**
 * The answer to what a server asked for in a call: the state it gave, the key it asked under, and the answer, the
 * person's `{ action }` to a question or a model's message to a model call.
 */
export interface Answered {
  state: string
  key?: string
  response: Record<string, unknown>
}

/** A client of an outside MCP server. */
export interface McpClient {
  tools(): Promise<OutsideTool[]>
  // `answer` is the answer to what the server asked for, with its state: it travels beside the input,
  // which is the model's, and never inside it.
  call(tool: string, input: unknown, signal: AbortSignal, answer?: Answered): Promise<Record<string, unknown>>
}

/** A request that a server sent down the stream of a call, with the stream to read on, the call's id and its lines. */
interface Question {
  message: Record<string, unknown>
  rest: AsyncGenerator<Record<string, unknown>>
  id: unknown
  lines: Record<string, string>
}

/** What one message that was sent was answered: its status and lines, and its answer or a question put first. */
interface Sent {
  status: number
  message?: Record<string, unknown>
  lines: Headers
  question?: Question
}

// What the client says of itself: it can put a question with yes and no to the person.
const can = { elicitation: {} }
const clientInfo = { name: 'tent', version: '1' }

/** A failure of the server, as every failure of an outside service is. */
const failed = (message: string, body?: unknown): TentError =>
  new TentError('T7115', message, { ...(body === undefined ? {} : { service: { body } }) })

/** The message of the data of one event of a stream, where that data is JSON. */
function messageOf(data: string): Record<string, unknown> | undefined {
  if (!data) return undefined
  try {
    return Object(JSON.parse(data))
  } catch {
    // An event that is no JSON is no message of the standard.
    return undefined
  }
}

/**
 * The messages of an answer, one at a time as they arrive: one of JSON, or each `data` of a stream of events. A
 * stream is read only as far as its reader asks, so a call may stop at a question and go on after its answer.
 */
async function* messagesOf(answer: Response): AsyncGenerator<Record<string, unknown>> {
  if (!(answer.headers.get('content-type') ?? '').includes('text/event-stream')) {
    const text = await answer.text()
    try {
      yield Object(JSON.parse(text))
      return
    } catch {
      throw failed(`The server answered ${answer.status} with no message of the standard.`, text.slice(0, 2000))
    }
  }
  for await (const event of eventsOf(answer.body)) {
    const message = messageOf(event.data)
    if (message) yield message
  }
}

/** The print of what a server asks: its method and what it hands with it, so that the same question is known again. */
const printOf = (message: Record<string, unknown>): string =>
  fingerprintOf(new TextEncoder().encode(written({ method: message.method, params: message.params }, undefined))).slice(
    0,
    16,
  )

/** A request that a server sent down the stream of a call: it has a method and an id of its own. */
const isRequest = (message: Record<string, unknown>): boolean =>
  typeof message.method === 'string' && message.id !== undefined

/** Whether a failure of the newest form says that the server does not know that form. */
const knowsNot = (status: number, error: unknown): boolean =>
  [400, 404, 405, 406].includes(status) ||
  (isStored(error) && (error.code === -32601 || error.code === -32602 || error.code === -32600))

/**
 * Takes how a server is reached, how long a request may take and how large its answer may be, and the form the
 * server was found to speak. Answers a client of it: the newest form is asked first, and the older one where the
 * server answers that it does not know it; there each request is the opening, its note and the request. It keeps
 * no session between two requests. A failure of the server is T7115.
 */
export function mcpClient(
  o: Way & { timeout: number; size: number; form?: Remembered; session?: KeptSession },
): McpClient {
  let ids = 0
  let form = o.form?.get()
  const waiting = new Map<number, (message: Record<string, unknown>) => void>()
  if ('channel' in o)
    o.channel.each((message) => {
      const id = Reflect.get(message, 'id')
      if (typeof id === 'number') waiting.get(id)?.(Object(message))
    })

  /** Sends one message and answers the message that answers it, or nothing for a note. */
  async function sent(
    body: Record<string, unknown>,
    lines: Record<string, string>,
    signal: AbortSignal,
  ): Promise<Sent> {
    if ('channel' in o) {
      if (body.id === undefined) {
        o.channel.send(body)
        return { status: 202, lines: new Headers() }
      }
      const message = await new Promise<Record<string, unknown>>((done, refused) => {
        const id = Number(body.id)
        // However the request ends, its waiter, its timer and its listener go with it.
        const over = (): void => {
          clearTimeout(timer)
          waiting.delete(id)
          signal.removeEventListener('abort', ended)
        }
        const ended = (): void => {
          over()
          refused(signal.reason)
        }
        const timer = setTimeout(() => {
          over()
          refused(failed('The program that is the server did not answer in time.'))
        }, o.timeout)
        if (signal.aborted) return ended()
        signal.addEventListener('abort', ended, { once: true })
        waiting.set(id, (heard) => {
          over()
          done(heard)
        })
        o.channel.send(body)
      })
      return { status: 200, message, lines: new Headers() }
    }
    const request = new Request(o.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...lines,
      },
      body: JSON.stringify(body),
    })
    const answer = await o.fetch(request, { size: o.size, time: o.timeout, signal })
    if (body.id === undefined) {
      await answer.body?.cancel()
      return { status: answer.status, lines: answer.headers }
    }
    if (answer.status === 202) return { status: 202, lines: answer.headers }
    if (answer.status >= 500) {
      await answer.body?.cancel()
      return { status: answer.status, lines: answer.headers }
    }
    // Read by hand, so that a stream that stops at a question is left open to be read on.
    const messages = messagesOf(answer)
    for (let next = await messages.next(); !next.done; next = await messages.next()) {
      const message = next.value
      if (message.id === body.id && !isRequest(message))
        return { status: answer.status, message, lines: answer.headers }
      // The older form puts its question down the stream of the call, and answers the call there after it.
      if (isRequest(message))
        return {
          status: answer.status,
          lines: answer.headers,
          question: { message, rest: messages, id: body.id, lines },
        }
    }
    return { status: answer.status, lines: answer.headers }
  }

  /** Reads on down a stream that stopped at a question, to the answer of its call. */
  async function readOn(question: Question): Promise<Sent> {
    for (let next = await question.rest.next(); !next.done; next = await question.rest.next()) {
      const message = next.value
      if (message.id === question.id && !isRequest(message)) return { status: 200, message, lines: new Headers() }
      if (isRequest(message)) return { status: 200, lines: new Headers(), question: { ...question, message } }
    }
    return { status: 200, lines: new Headers() }
  }

  /** One request in the newest form: its version and what the client can do travel with it. */
  async function newestAsked(method: string, params: Record<string, unknown>, signal: AbortSignal) {
    const body = {
      jsonrpc: '2.0',
      id: ++ids,
      method,
      params: { ...params, _meta: { [meta.version]: newest, [meta.can]: can } },
    }
    return sent(body, { [headers.version]: newest, [headers.method]: method }, signal)
  }

  /** One request in the older form: the opening, its note, and the request, in the session the opening gave. */
  async function olderAsked(method: string, params: Record<string, unknown>, signal: AbortSignal) {
    const request = (lines: Record<string, string>) =>
      sent({ jsonrpc: '2.0', id: ++ids, method, params }, lines, signal)
    if (!o.session) return request(await opened(signal))
    // A session that is kept for a run is asked in again, opened once for calls that start together, and opened
    // anew where the server no longer knows it.
    const kept = await o.session.hold(() => opened(signal))
    const answer = await request(kept)
    if (answer.status !== 404 && answer.status !== 400) return answer
    o.session.drop()
    return request(await o.session.hold(() => opened(signal)))
  }

  /** The opening of the older form and its note: the lines of the session it gave. */
  async function opened(signal: AbortSignal): Promise<Record<string, string>> {
    const version = older[0]
    const answer = await sent(
      {
        jsonrpc: '2.0',
        id: ++ids,
        method: methods.open,
        params: { protocolVersion: version, capabilities: can, clientInfo },
      },
      {},
      signal,
    )
    const error = answer.message?.error
    if (!answer.message || error !== undefined)
      throw failed(`The server did not open: ${isStored(error) ? String(error.message) : `status ${answer.status}`}.`)
    const session = answer.lines.get('mcp-session-id')
    const lines: Record<string, string> = {
      [headers.version]: version,
      ...(session ? { 'mcp-session-id': session } : {}),
    }
    await sent({ jsonrpc: '2.0', method: 'notifications/initialized' }, lines, signal)
    return lines
  }

  /**
   * Asks the server, in the form it speaks, and answers the result of the request. `carried` is an answer of the
   * person to a question of a call that is held no more: where the server asks that question again down the
   * stream, it is answered at once, and the stream is read on.
   */
  async function asked(
    method: string,
    params: Record<string, unknown>,
    signal: AbortSignal,
    carried?: { question: string; response: Record<string, unknown> },
  ): Promise<Record<string, unknown>> {
    let answer = form === 'older' ? await olderAsked(method, params, signal) : await newestAsked(method, params, signal)
    if (form === undefined) {
      if (knowsNot(answer.status, answer.message?.error)) {
        form = 'older'
        answer = await olderAsked(method, params, signal)
      } else form = 'newest'
      o.form?.set(form)
    }
    const { question } = answer
    if (carried && question && printOf(question.message) === carried.question) {
      await sent({ jsonrpc: '2.0', id: question.message.id, result: carried.response }, question.lines, signal)
      answer = await readOn(question)
    }
    return resultOf(answer)
  }

  /**
   * What a server asked for down the stream of a call, as the failure that passes it up: the call is held where it
   * waits, and the answer is sent to the server in its session, after which the stream is read on to the answer of
   * the call.
   */
  function heldAsk(question: Question): TentError {
    const { message } = question
    const params = isStored(message.params) ? message.params : {}
    if (!answerable(String(message.method), params)) {
      void question.rest.return(undefined)
      return askedFor(String(message.method), params)
    }
    const state = holdCall(
      {
        async answered(response) {
          const reply = { jsonrpc: '2.0', id: message.id, result: response }
          await sent(reply, question.lines, AbortSignal.timeout(o.timeout))
          return resultOf(await readOn(question))
        },
        drop: () => void question.rest.return(undefined),
      },
      o.timeout,
      printOf(message),
    )
    return askedFor(String(message.method), params, { state })
  }

  /** The result of a request as the server answered it: its failure is T7115, and what it asks for is passed up. */
  function resultOf(answer: Sent): Record<string, unknown> {
    if (answer.question) throw heldAsk(answer.question)
    const error = answer.message?.error
    if (error !== undefined)
      throw failed(`The server failed: ${isStored(error) ? String(error.message) : 'with no words'}.`, error)
    if (!answer.message) throw failed(`The server answered ${answer.status} with no answer of the request.`)
    return isStored(answer.message.result) ? answer.message.result : {}
  }

  return {
    async tools() {
      const signal = AbortSignal.timeout(o.timeout)
      const found: OutsideTool[] = []
      let cursor: unknown
      for (let page = 0; page < 100; page++) {
        const result = await asked(methods.list, typeof cursor === 'string' ? { cursor } : {}, signal)
        for (const one of Array.isArray(result.tools) ? result.tools : [])
          if (isStored(one) && typeof one.name === 'string')
            found.push({
              name: one.name,
              about: typeof one.description === 'string' ? one.description : '',
              schema: isStored(one.inputSchema) ? one.inputSchema : { type: 'object' },
            })
        cursor = result.nextCursor
        if (typeof cursor !== 'string') break
      }
      return found
    },
    async call(tool, input, signal, answer) {
      const given = isStored(input) ? input : {}
      // A call held where its server asked, in the older form, goes on there; one that is held no more is made anew.
      const held = answer && isHeldState(answer.state) ? takeCall(answer.state) : undefined
      const theirs = answer && !isHeldState(answer.state) ? answer : undefined
      // An answer to a call that is held no more goes to the same question, where the call made anew asks it.
      const carried =
        answer && isHeldState(answer.state) && !held
          ? { question: questionInState(answer.state), response: answer.response }
          : undefined
      const more = theirs
        ? { inputResponses: { [theirs.key ?? 'ask']: theirs.response }, requestState: theirs.state }
        : {}
      // The step's end stops the call, but not a call that is held for its answer.
      const own = new AbortController()
      const stop = (): void => own.abort(signal.reason)
      signal.addEventListener('abort', stop, { once: true })
      try {
        const result =
          held && answer
            ? await held.answered(answer.response)
            : await asked(methods.call, { name: tool, arguments: given, ...more }, own.signal, carried)
        if (result.resultType !== moreNeeded) return result
        throw moreAsked(result)
      } finally {
        signal.removeEventListener('abort', stop)
      }
    },
  }
}

/** Whether what a server asks for is passed up to be answered: a question with yes and no alone, or a model call. */
function answerable(method: string, params: Record<string, unknown>): boolean {
  if (method === methods.sample) return true
  const schema = isStored(params.requestedSchema) ? params.requestedSchema : undefined
  const fields = schema && isStored(schema.properties) ? Object.keys(schema.properties) : []
  return method === methods.question && fields.length === 0
}

/**
 * The failure that passes up what a server asked for, with its state and the key it is answered under. A question
 * with yes and no names it in `fields.question`, and a model call holds what the server asked in `fields.sample`,
 * as JSON, with the words that are told where no model answers it. Anything else is T7115 that names it.
 */
function askedFor(method: string, params: Record<string, unknown>, at?: { state: string; key?: string }): TentError {
  const answers = at && answerable(method, params) ? { state: at.state, ...(at.key ? { key: at.key } : {}) } : undefined
  if (answers && method === methods.question)
    return new TentError('T7115', `The server asks the person: ${String(params.message)}`, {
      fields: { question: String(params.message ?? ''), ...answers },
    })
  const words = `The server asked for ${method}, which the engine does not answer.`
  if (answers) return new TentError('T7115', words, { fields: { sample: JSON.stringify(params), ...answers } })
  return failed(words)
}

/** The failure of a call whose server needs more first: what it asks for, passed up, under its key and its state. */
function moreAsked(result: Record<string, unknown>): TentError {
  const requests = isStored(result.inputRequests) ? Object.entries(result.inputRequests) : []
  const [[key, first] = ['', undefined]] = requests
  const method = isStored(first) ? String(first.method) : 'something'
  const params = isStored(first) && isStored(first.params) ? first.params : {}
  const state = typeof result.requestState === 'string' ? result.requestState : undefined
  return askedFor(method, params, requests.length === 1 && state !== undefined ? { state, key } : undefined)
}
