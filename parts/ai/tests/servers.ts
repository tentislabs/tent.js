import assert from 'node:assert/strict'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createServer } from 'node:http'
import type { TestContext } from 'node:test'

/** What a stand-in server was asked: the method, the path, the headers and the body of each request, in their order. */
export interface Asked {
  method: string
  path: string
  headers: Record<string, string>
  body: Buffer
  json(): Record<string, unknown>
}

/** A server on this computer that a test started: its address, and what it was asked so far. */
export interface StandIn {
  origin: string
  asked: Asked[]
}

/**
 * Starts a server on this computer, on a free port that the system gives, which answers each request as the test
 * says. It is closed, with every connection it holds, when the test ends, also where the test fails.
 */
export async function standIn(
  t: TestContext,
  answer: (asked: Asked, response: ServerResponse, request: IncomingMessage) => void,
): Promise<StandIn> {
  const asked: Asked[] = []
  const server = createServer((request, response) => {
    const pieces: Buffer[] = []
    request.on('data', (piece: Buffer) => pieces.push(piece))
    request.on('end', () => {
      const headers: Record<string, string> = {}
      for (const [name, value] of Object.entries(request.headers)) headers[name] = String(value)
      const body = Buffer.concat(pieces)
      const one: Asked = {
        method: request.method ?? '',
        path: request.url ?? '',
        headers,
        body,
        json: () => JSON.parse(body.toString('utf8')),
      }
      asked.push(one)
      answer(one, response, request)
    })
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((done) => server.close(done))
  })
  const at = server.address()
  assert.ok(at !== null && typeof at === 'object')
  return { origin: `http://127.0.0.1:${at.port}`, asked }
}

/** Answers a stream of server-sent events, each with its name where it has one. */
export function sse(response: ServerResponse, events: { event?: string; data: unknown }[]): void {
  response.writeHead(200, { 'content-type': 'text/event-stream' })
  for (const one of events)
    response.write(
      `${one.event ? `event: ${one.event}\n` : ''}data: ${typeof one.data === 'string' ? one.data : JSON.stringify(one.data)}\n\n`,
    )
  response.end()
}

/** Answers JSON with a status. */
export function json(
  response: ServerResponse,
  value: unknown,
  status = 200,
  headers: Record<string, string> = {},
): void {
  response.writeHead(status, { 'content-type': 'application/json', ...headers })
  response.end(JSON.stringify(value))
}

/** What an answer of a stand-in holds: its text, the tools it asks for, a typed value, the model's reasoning, and how it ends. */
export interface Said {
  text?: string
  calls?: { id: string; tool: string; input: unknown }[]
  value?: unknown
  reasoning?: string
  stop?: 'refused' | 'cutOff'
}

/** The events of the Messages API of Anthropic for an answer. */
export function anthropicEvents(said: Said): { event: string; data: unknown }[] {
  const events: { event: string; data: unknown }[] = [
    {
      event: 'message_start',
      data: {
        type: 'message_start',
        message: {
          usage: { input_tokens: 21, output_tokens: 1, cache_read_input_tokens: 5, cache_creation_input_tokens: 3 },
        },
      },
    },
  ]
  let index = 0
  if (said.reasoning !== undefined) {
    events.push({
      event: 'content_block_start',
      data: { type: 'content_block_start', index, content_block: { type: 'thinking', thinking: '' } },
    })
    events.push({
      event: 'content_block_delta',
      data: { type: 'content_block_delta', index, delta: { type: 'thinking_delta', thinking: said.reasoning } },
    })
    events.push({
      event: 'content_block_delta',
      data: { type: 'content_block_delta', index, delta: { type: 'signature_delta', signature: 'sig' } },
    })
    events.push({ event: 'content_block_stop', data: { type: 'content_block_stop', index } })
    index++
  }
  if (said.text !== undefined) {
    events.push({
      event: 'content_block_start',
      data: { type: 'content_block_start', index, content_block: { type: 'text', text: '' } },
    })
    for (const piece of [said.text.slice(0, 3), said.text.slice(3)])
      events.push({
        event: 'content_block_delta',
        data: { type: 'content_block_delta', index, delta: { type: 'text_delta', text: piece } },
      })
    events.push({ event: 'content_block_stop', data: { type: 'content_block_stop', index } })
    index++
  }
  const calls = [
    ...(said.calls ?? []),
    ...(said.value === undefined ? [] : [{ id: 'answer-1', tool: 'answer', input: said.value }]),
  ]
  for (const call of calls) {
    events.push({
      event: 'content_block_start',
      data: {
        type: 'content_block_start',
        index,
        content_block: { type: 'tool_use', id: call.id, name: call.tool, input: {} },
      },
    })
    const text = JSON.stringify(call.input)
    for (const piece of [text.slice(0, 4), text.slice(4)])
      events.push({
        event: 'content_block_delta',
        data: { type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: piece } },
      })
    events.push({ event: 'content_block_stop', data: { type: 'content_block_stop', index } })
    index++
  }
  const stop =
    said.stop === 'refused' ? 'refusal' : said.stop === 'cutOff' ? 'max_tokens' : calls.length ? 'tool_use' : 'end_turn'
  events.push({
    event: 'message_delta',
    data: { type: 'message_delta', delta: { stop_reason: stop }, usage: { output_tokens: 9 } },
  })
  events.push({ event: 'message_stop', data: { type: 'message_stop' } })
  return events
}

/** The events of the responses API of OpenAI for an answer. */
export function openaiEvents(said: Said): { event: string; data: unknown }[] {
  const events: { event: string; data: unknown }[] = []
  const output: unknown[] = []
  if (said.reasoning !== undefined) {
    events.push({
      event: 'response.reasoning_summary_text.delta',
      data: { type: 'response.reasoning_summary_text.delta', delta: said.reasoning },
    })
    output.push({
      type: 'reasoning',
      id: 'rs_1',
      encrypted_content: 'kept',
      summary: [{ type: 'summary_text', text: said.reasoning }],
    })
  }
  const text = said.value === undefined ? said.text : JSON.stringify(said.value)
  if (text !== undefined) {
    for (const piece of [text.slice(0, 3), text.slice(3)])
      events.push({ event: 'response.output_text.delta', data: { type: 'response.output_text.delta', delta: piece } })
    output.push({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] })
  }
  if (said.stop === 'refused') {
    events.push({ event: 'response.refusal.delta', data: { type: 'response.refusal.delta', delta: 'No.' } })
    output.push({ type: 'message', role: 'assistant', content: [{ type: 'refusal', refusal: 'No.' }] })
  }
  for (const call of said.calls ?? [])
    output.push({ type: 'function_call', call_id: call.id, name: call.tool, arguments: JSON.stringify(call.input) })
  const response = {
    status: said.stop === 'cutOff' ? 'incomplete' : 'completed',
    ...(said.stop === 'cutOff' ? { incomplete_details: { reason: 'max_output_tokens' } } : {}),
    output,
    usage: { input_tokens: 21, output_tokens: 9, input_tokens_details: { cached_tokens: 5 } },
  }
  events.push({
    event: said.stop === 'cutOff' ? 'response.incomplete' : 'response.completed',
    data: { type: said.stop === 'cutOff' ? 'response.incomplete' : 'response.completed', response },
  })
  return events
}

/** The events of the chat completions, which open-model servers speak, for an answer. */
export function chatEvents(said: Said): { data: unknown }[] {
  const events: { data: unknown }[] = []
  if (said.reasoning !== undefined)
    events.push({ data: { choices: [{ index: 0, delta: { reasoning_content: said.reasoning } }] } })
  const text = said.value === undefined ? said.text : JSON.stringify(said.value)
  if (text !== undefined)
    for (const piece of [text.slice(0, 3), text.slice(3)])
      events.push({ data: { choices: [{ index: 0, delta: { content: piece } }] } })
  for (const [i, call] of (said.calls ?? []).entries()) {
    const args = JSON.stringify(call.input)
    events.push({
      data: {
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                { index: i, id: call.id, type: 'function', function: { name: call.tool, arguments: args.slice(0, 2) } },
              ],
            },
          },
        ],
      },
    })
    events.push({
      data: { choices: [{ index: 0, delta: { tool_calls: [{ index: i, function: { arguments: args.slice(2) } }] } }] },
    })
  }
  const finish =
    said.stop === 'refused'
      ? 'content_filter'
      : said.stop === 'cutOff'
        ? 'length'
        : said.calls?.length
          ? 'tool_calls'
          : 'stop'
  events.push({ data: { choices: [{ index: 0, delta: {}, finish_reason: finish }] } })
  events.push({
    data: {
      choices: [],
      usage: { prompt_tokens: 21, completion_tokens: 9, prompt_tokens_details: { cached_tokens: 5 } },
    },
  })
  events.push({ data: '[DONE]' })
  return events
}

/** The events of the API of Gemini for an answer. */
export function geminiEvents(said: Said): { data: unknown }[] {
  const parts: unknown[] = []
  if (said.reasoning !== undefined) parts.push({ text: said.reasoning, thought: true })
  const text = said.value === undefined ? said.text : JSON.stringify(said.value)
  const first = text === undefined ? [] : [{ text: text.slice(0, 3) }]
  const rest: unknown[] = text === undefined ? [] : [{ text: text.slice(3) }]
  for (const call of said.calls ?? []) rest.push({ functionCall: { id: call.id, name: call.tool, args: call.input } })
  const finish = said.stop === 'refused' ? 'SAFETY' : said.stop === 'cutOff' ? 'MAX_TOKENS' : 'STOP'
  return [
    { data: { candidates: [{ content: { role: 'model', parts: [...parts, ...first] } }] } },
    {
      data: {
        candidates: [{ content: { role: 'model', parts: rest }, finishReason: finish }],
        usageMetadata: { promptTokenCount: 21, candidatesTokenCount: 9, cachedContentTokenCount: 5 },
      },
    },
  ]
}
