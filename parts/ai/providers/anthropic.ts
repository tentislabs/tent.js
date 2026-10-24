import type { Message, Provider, ReplyEnd, ReplyPart, ReplyRequest, ToolCall, Units } from '../face.ts'
import { providerAddresses, ProviderFailure } from '../../core/internal.ts'
import { eventsOf } from '../../connect/index.ts'
import { dataOf } from './events.ts'
import { base64, baseOf, cacheOff, numberAt, optionsOf, parsedOr, sent } from './sent.ts'

// The Messages API of Anthropic, as `sources.md` holds it. 529 is its own status for a server that is too busy.
const own = `${providerAddresses.anthropic}/v1`
const busy = [529]
const version = '2023-06-01'

// A typed answer is asked for as the input of one tool that the model must call.
const answerTool = 'answer'

type Block = Record<string, unknown>

/** The blocks of one message, in the form of the Messages API. */
function blocksOf(message: Message): Block[] {
  const blocks: Block[] = []
  if (message.who === 'tool') {
    const content =
      message.error ?? (typeof message.result === 'string' ? message.result : JSON.stringify(message.result))
    blocks.push({
      type: 'tool_result',
      tool_use_id: message.id ?? '',
      content: content ?? '',
      ...(message.error === undefined ? {} : { is_error: true }),
    })
    return blocks
  }
  // What the provider asked to be handed back, the model's own reasoning with its signatures, comes first.
  if (message.who === 'assistant' && Array.isArray(message.keep))
    for (const one of message.keep) blocks.push(Object(one))
  for (const image of message.images ?? [])
    blocks.push({ type: 'image', source: { type: 'base64', media_type: image.kind, data: base64(image.bytes) } })
  if (message.text !== undefined && message.text !== '') blocks.push({ type: 'text', text: message.text })
  for (const call of message.calls ?? [])
    blocks.push({ type: 'tool_use', id: call.id, name: call.tool, input: call.input })
  return blocks
}

/** The messages of a request, in turns: two messages of one side in a row are one message there. */
function messagesOf(messages: Message[]): { role: string; content: Block[] }[] {
  const turns: { role: string; content: Block[] }[] = []
  for (const message of messages) {
    const role = message.who === 'assistant' ? 'assistant' : 'user'
    const blocks = blocksOf(message)
    if (!blocks.length) continue
    const last = turns.at(-1)
    if (last?.role === role) last.content.push(...blocks)
    else turns.push({ role, content: blocks })
  }
  return turns
}

/** The tools that the server runs itself, by the name a model states them under, in the form of the Messages API. */
const hostedForms: Record<string, Record<string, unknown>> = {
  webSearch: { type: 'web_search_20250305', name: 'web_search' },
  webFetch: { type: 'web_fetch_20250910', name: 'web_fetch' },
  codeExecution: { type: 'code_execution_20250825', name: 'code_execution' },
}

/** The body of a request, with the marks that ask the server to keep its start, unless the model says otherwise. */
function bodyOf(o: ReplyRequest): Record<string, unknown> {
  const marked = !cacheOff(o.model)
  const mark = { cache_control: { type: 'ephemeral' } }
  const tools: Record<string, unknown>[] = (o.tools ?? []).map((one) => ({
    name: one.name,
    description: one.about,
    input_schema: one.input,
  }))
  if (o.shape) tools.push({ name: answerTool, description: 'Give the answer.', input_schema: o.shape })
  // The server's own tools stand among the others, each in the form its server names it.
  for (const name of o.hosted ?? []) if (Object.hasOwn(hostedForms, name)) tools.push({ ...hostedForms[name] })
  if (marked && tools.length) tools[tools.length - 1] = { ...tools[tools.length - 1], ...mark }
  const messages = messagesOf(o.messages)
  const last = messages.at(-1)?.content.at(-1)
  if (marked && last) Object.assign(last, mark)
  const options = optionsOf(o.model)
  return {
    model: o.model.name,
    max_tokens: 8192,
    ...options,
    ...(o.instructions ? { system: [{ type: 'text', text: o.instructions, ...(marked ? mark : {}) }] } : {}),
    messages,
    ...(tools.length ? { tools } : {}),
    ...(o.shape ? { tool_choice: { type: 'tool', name: answerTool } } : {}),
    stream: true,
  }
}

/** What a server reported it used: the tokens read, those of a kept start among them, and those written. */
function unitsOf(usage: Record<string, number | undefined>): Units {
  const cached = usage.cache_read_input_tokens ?? 0
  const stored = usage.cache_creation_input_tokens ?? 0
  const units: Units = {}
  if (usage.input_tokens !== undefined) units.tokensIn = usage.input_tokens + cached + stored
  if (usage.output_tokens !== undefined) units.tokensOut = usage.output_tokens
  if (usage.cache_read_input_tokens !== undefined) units.tokensCached = cached
  if (usage.cache_creation_input_tokens !== undefined) units.tokensStored = stored
  if (usage.web_search_requests !== undefined) units.webSearches = usage.web_search_requests
  return units
}

/** The headers of every request: the key, the version of the API, and the kind of the body. */
const headersOf = (key: string | undefined): Record<string, string> => ({
  'content-type': 'application/json',
  'anthropic-version': version,
  ...(key === undefined ? {} : { 'x-api-key': key }),
})

/** One answer of the Messages API, read part by part from its stream of events. */
async function* replied(o: ReplyRequest): AsyncGenerator<ReplyPart> {
  const answer = await sent(
    o,
    `${baseOf(o.model, own)}/messages`,
    { method: 'POST', headers: headersOf(o.key), body: JSON.stringify(bodyOf(o)) },
    busy,
  )
  const usage: Record<string, number | undefined> = {}
  const blocks: Record<string, unknown>[] = []
  let text = ''
  let stop: unknown
  const raw: unknown[] = []
  for await (const event of eventsOf(answer.body)) {
    const data = dataOf(event)
    if (!data) continue
    raw.push(data)
    const type = data.type
    if (type === 'error') {
      const kind = Reflect.get(Object(data.error), 'type')
      const words = String(Reflect.get(Object(data.error), 'message') ?? 'The stream ended with an error.')
      throw new ProviderFailure(kind === 'overloaded_error' || kind === 'rate_limit_error' ? 'busy' : 'server', words)
    }
    if (type === 'message_start') {
      const started = Object(Reflect.get(Object(data.message), 'usage'))
      for (const name of ['input_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens', 'output_tokens'])
        if (typeof started[name] === 'number') usage[name] = started[name]
    } else if (type === 'content_block_start') {
      const block = Object(data.content_block)
      blocks[Number(data.index)] = { ...block, json: '', thinking: block.thinking ?? '', text: block.text ?? '' }
    } else if (type === 'content_block_delta') {
      const block = blocks[Number(data.index)] ?? {}
      const delta = Object(data.delta)
      if (delta.type === 'text_delta') {
        block.text = `${block.text ?? ''}${delta.text}`
        text += String(delta.text)
        yield { text: String(delta.text) }
      } else if (delta.type === 'input_json_delta') {
        block.json = `${block.json ?? ''}${delta.partial_json}`
        // A typed answer comes as the input of its tool: its JSON is the text of the answer.
        if (block.name === answerTool && o.shape) yield { text: String(delta.partial_json) }
      } else if (delta.type === 'thinking_delta') {
        block.thinking = `${block.thinking ?? ''}${delta.thinking}`
        yield { reasoning: String(delta.thinking) }
      } else if (delta.type === 'signature_delta') block.signature = `${block.signature ?? ''}${delta.signature}`
    } else if (type === 'message_delta') {
      stop = Reflect.get(Object(data.delta), 'stop_reason')
      const ended = numberAt(data, 'usage.output_tokens')
      if (ended !== undefined) usage.output_tokens = ended
      const searched = numberAt(data, 'usage.server_tool_use.web_search_requests')
      if (searched !== undefined) usage.web_search_requests = searched
    }
  }
  if (stop === 'refusal') throw new ProviderFailure('refused', 'The model refused.')
  if (stop === 'max_tokens') throw new ProviderFailure('cutOff', 'The answer reached its length.')
  const calls: ToolCall[] = []
  let value: unknown
  const keep: unknown[] = []
  for (const block of blocks) {
    if (!block) continue
    if (block.type === 'tool_use') {
      const input = parsedOr(String(block.json ?? ''))
      if (block.name === answerTool && o.shape) value = input
      else calls.push({ id: String(block.id), tool: String(block.name), input })
    } else if (block.type === 'thinking')
      keep.push({ type: 'thinking', thinking: block.thinking, signature: block.signature ?? '' })
    else if (block.type === 'redacted_thinking') keep.push({ type: 'redacted_thinking', data: block.data })
    // What the server's own tools did is handed back with the next request of the run, as it came.
    else if (block.type === 'server_tool_use' || String(block.type).endsWith('_tool_result')) {
      const { json, thinking: _, text: __, ...made } = block
      keep.push(block.type === 'server_tool_use' ? { ...made, input: parsedOr(String(json ?? '')) } : made)
    }
  }
  const end: ReplyEnd = { text, calls, units: unitsOf(usage), raw }
  if (value !== undefined) end.value = value
  if (keep.length) end.keep = keep
  yield { end }
}

/** The provider `anthropic`: the Messages API, with its stream, its tools, a typed answer and the model's reasoning. */
export const anthropic: Provider = {
  reply: (o) => replied(o),
}
