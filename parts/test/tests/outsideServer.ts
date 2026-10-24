import type { ServerResponse } from 'node:http'
import type { TestContext } from 'node:test'
import type { Heard, Remote } from './remotes.ts'
import { answerJson, remoteOf } from './remotes.ts'

/** One message of the standard as an event of a stream. */
const event = (message: object): string => `event: message\ndata: ${JSON.stringify(message)}\n\n`

// The id of the question that the older form puts to the client down the stream of a call.
const questionId = 'question-1'

/** A tool of the stand-in server, as it lists it. */
export interface StandTool {
  name: string
  description: string
  inputSchema: object
}

/** What a tool of the stand-in answers: a result of the standard, or a question to the person with yes and no. */
export type StandAnswer = Record<string, unknown> | { question: string } | { asks: string } | { samples: string }

/** A stand-in for an outside MCP server: its tools, which a test may change, its answers, and what it was asked. */
export interface Stand {
  remote: Remote
  tools: StandTool[]
  // The messages it was sent, each with the lines of its request.
  asked: { method: string; params: Record<string, unknown>; headers: Record<string, string> }[]
}

const newest = '2026-07-28'

/** The messages of a request of the standard, read from its body. */
function messageOf(heard: Heard): Record<string, unknown> {
  try {
    return Object(JSON.parse(heard.body.toString('utf8')))
  } catch {
    return {}
  }
}

/**
 * Starts a stand-in for an outside MCP server at `/mcp` on this computer. With `older` it knows only the older form:
 * a request of the newest form is a method it does not know, and a call needs the opening first. A tool answers what
 * `answer` gives: a result; `{ question }`, which it asks the person in the newest form and answers once a yes comes
 * back, and in the older form puts down the stream of the call, which it ends with the answer once the client
 * answered; `{ samples }`, a model call that it asks the client for in the newest form, with those words; or
 * `{ asks }`, a request of another kind than a question, which the engine cannot answer.
 */
export async function outsideServer(
  t: TestContext,
  o: {
    older?: boolean
    tools: StandTool[]
    answer(name: string, input: Record<string, unknown>): StandAnswer
    // Where it signs people in: its own documents name it, and it takes a client by its document, or by registering.
    signIn?: 'documents' | 'registering'
  },
): Promise<Stand> {
  const stand: Stand = { remote: { origin: '', heard: [] }, tools: o.tools, asked: [] }
  let opened = false
  let sessions = 0
  // A call of the older form that waits, down its stream, for the client's answer to its question.
  let waiting: { response: ServerResponse; id: unknown } | undefined
  stand.remote = await remoteOf(t, (heard, response) => {
    const path = heard.path.split('?')[0]
    const origin = stand.remote.origin
    if (o.signIn && path === '/.well-known/oauth-protected-resource/mcp')
      return answerJson(response, 200, {
        resource: `${origin}/mcp`,
        authorization_servers: [origin],
        scopes_supported: ['tools'],
      })
    if (o.signIn && path === '/.well-known/oauth-authorization-server')
      return answerJson(response, 200, {
        issuer: origin,
        authorization_endpoint: `${origin}/authorize`,
        token_endpoint: `${origin}/token`,
        code_challenge_methods_supported: ['S256'],
        ...(o.signIn === 'documents'
          ? { client_id_metadata_document_supported: true }
          : { registration_endpoint: `${origin}/register` }),
      })
    if (o.signIn && path === '/register') return answerJson(response, 201, { client_id: 'registered-1' })
    if (o.signIn && path === '/token')
      return answerJson(response, 200, {
        access_token: 'outside-access',
        refresh_token: 'outside-refresh',
        token_type: 'bearer',
        expires_in: 3600,
      })
    const message = messageOf(heard)
    const params: Record<string, unknown> = Object(message.params)
    const method = String(message.method ?? '')
    stand.asked.push({ method, params, headers: heard.headers })
    const reply = (result: unknown): void => answerJson(response, 200, { jsonrpc: '2.0', id: message.id, result })
    const failed = (code: number, words: string): void =>
      answerJson(response, 200, { jsonrpc: '2.0', id: message.id, error: { code, message: words } })
    // The client's answer to the question that the older form put down the stream of a call, which then ends it.
    if (message.method === undefined && message.id === questionId && waiting) {
      const action = Object(message.result).action
      const text = action === 'accept' ? 'It was done.' : 'It was not done.'
      waiting.response.end(event({ jsonrpc: '2.0', id: waiting.id, result: { content: [{ type: 'text', text }] } }))
      waiting = undefined
      response.writeHead(202)
      response.end()
      return
    }
    if (message.id === undefined) {
      response.writeHead(202)
      response.end()
      return
    }
    const meta: Record<string, unknown> = Object(params._meta)
    const isNewest = meta['io.modelcontextprotocol/protocolVersion'] === newest
    if (o.older && (isNewest || method === 'server/discover')) return failed(-32601, `Method not found: ${method}`)
    if (method === 'server/discover')
      return reply({
        supportedVersions: [newest],
        capabilities: { tools: {} },
        serverInfo: { name: 'stand', version: '1' },
      })
    if (method === 'initialize') {
      opened = true
      // Each opening is a session of its own, which the client names in its later requests.
      sessions += 1
      return answerJson(
        response,
        200,
        {
          jsonrpc: '2.0',
          id: message.id,
          result: {
            protocolVersion: '2025-11-25',
            capabilities: { tools: {} },
            serverInfo: { name: 'stand', version: '1' },
          },
        },
        { 'mcp-session-id': `session-${sessions}` },
      )
    }
    if (o.older && !opened) return failed(-32600, 'The session was not opened.')
    if (method === 'tools/list') return reply({ tools: stand.tools })
    if (method !== 'tools/call') return failed(-32601, `Method not found: ${method}`)
    const name = String(params.name)
    const answer = o.answer(name, Object(params.arguments))
    const responses: Record<string, unknown> = Object(params.inputResponses)
    if ('question' in answer && typeof answer.question === 'string' && o.older) {
      // The older form asks down the stream of the call, and answers the call there once the client answered.
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      response.write(
        event({
          jsonrpc: '2.0',
          id: questionId,
          method: 'elicitation/create',
          params: { message: answer.question, requestedSchema: { type: 'object', properties: {} } },
        }),
      )
      waiting = { response, id: message.id }
      return
    }
    if ('question' in answer && typeof answer.question === 'string') {
      const given: Record<string, unknown> = Object(responses.ask)
      if (params.requestState === 'the-state')
        return reply({
          content: [{ type: 'text', text: given.action === 'accept' ? 'It was done.' : 'It was not done.' }],
        })
      return reply({
        resultType: 'input_required',
        inputRequests: {
          ask: {
            method: 'elicitation/create',
            params: { message: answer.question, requestedSchema: { type: 'object', properties: {} } },
          },
        },
        requestState: 'the-state',
      })
    }
    if ('samples' in answer && typeof answer.samples === 'string') {
      const given: Record<string, unknown> = Object(responses.sample)
      if (params.requestState === 'the-sample')
        return reply({ content: [{ type: 'text', text: `Sampled: ${String(Object(given.content).text)}` }] })
      return reply({
        resultType: 'input_required',
        inputRequests: {
          sample: {
            method: 'sampling/createMessage',
            params: { messages: [{ role: 'user', content: { type: 'text', text: answer.samples } }], maxTokens: 50 },
          },
        },
        requestState: 'the-sample',
      })
    }
    if ('asks' in answer && typeof answer.asks === 'string')
      return reply({
        resultType: 'input_required',
        inputRequests: { ask: { method: answer.asks, params: {} } },
        requestState: 'another-state',
      })
    return reply(answer)
  })
  return stand
}
