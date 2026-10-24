import type { Message, Provider, ReplyEnd, ReplyPart, ReplyRequest, ToolCall, Units } from '../face.ts'
import { providerAddresses, ProviderFailure } from '../../core/internal.ts'
import { eventsOf } from '../../connect/index.ts'
import { dataOf } from './events.ts'
import { heard, spoken, vectors } from './openaiAudio.ts'
import { base64, baseOf, numberAt, optionsOf, parsedOr, sent } from './sent.ts'

// The newer API of OpenAI, its responses, as `sources.md` holds it.
const own = `${providerAddresses.openai}/v1`

/** The entries of the input of a request, in the form of the responses API. */
function inputOf(messages: Message[]): Record<string, unknown>[] {
  const entries: Record<string, unknown>[] = []
  for (const message of messages) {
    if (message.who === 'tool') {
      const output =
        message.error ?? (typeof message.result === 'string' ? message.result : JSON.stringify(message.result))
      entries.push({ type: 'function_call_output', call_id: message.id ?? '', output: output ?? '' })
      continue
    }
    // What the provider asked to be handed back, the model's reasoning, comes first and as it came.
    if (message.who === 'assistant' && Array.isArray(message.keep))
      for (const one of message.keep) entries.push(Object(one))
    const content: Record<string, unknown>[] = []
    const kind = message.who === 'assistant' ? 'output_text' : 'input_text'
    for (const image of message.images ?? [])
      content.push({ type: 'input_image', image_url: `data:${image.kind};base64,${base64(image.bytes)}` })
    if (message.text !== undefined && message.text !== '') content.push({ type: kind, text: message.text })
    if (content.length) entries.push({ role: message.who, content })
    for (const call of message.calls ?? [])
      entries.push({ type: 'function_call', call_id: call.id, name: call.tool, arguments: JSON.stringify(call.input) })
  }
  return entries
}

/** The tools that the server runs itself, by the name a model states them under, in the form of the responses API. */
const hostedForms: Record<string, Record<string, unknown>> = {
  webSearch: { type: 'web_search' },
  codeInterpreter: { type: 'code_interpreter', container: { type: 'auto' } },
}

/** The body of a request. A model that states `reasoning` in its options is asked for its reasoning and its keep. */
function bodyOf(o: ReplyRequest): Record<string, unknown> {
  const options = optionsOf(o.model)
  const reasons = options.reasoning !== undefined
  const tools: Record<string, unknown>[] = (o.tools ?? []).map((one) => ({
    type: 'function',
    name: one.name,
    description: one.about,
    parameters: one.input,
    strict: false,
  }))
  // The server's own tools stand among the others, each in the form its server names it.
  for (const name of o.hosted ?? []) if (Object.hasOwn(hostedForms, name)) tools.push({ ...hostedForms[name] })
  return {
    model: o.model.name,
    ...options,
    ...(o.instructions ? { instructions: o.instructions } : {}),
    input: inputOf(o.messages),
    ...(tools.length ? { tools } : {}),
    ...(o.shape ? { text: { format: { type: 'json_schema', name: 'answer', schema: o.shape, strict: false } } } : {}),
    ...(reasons ? { include: ['reasoning.encrypted_content'] } : {}),
    store: false,
    stream: true,
  }
}

/** What the server reported it used: the tokens read, those of a kept start among them, and those written. */
function unitsOf(usage: unknown): Units {
  const units: Units = {}
  const tokensIn = numberAt(usage, 'input_tokens')
  const tokensOut = numberAt(usage, 'output_tokens')
  const cached = numberAt(usage, 'input_tokens_details.cached_tokens')
  if (tokensIn !== undefined) units.tokensIn = tokensIn
  if (tokensOut !== undefined) units.tokensOut = tokensOut
  if (cached !== undefined) units.tokensCached = cached
  return units
}

/** The headers of every request. */
export const headersOf = (key: string | undefined, json = true): Record<string, string> => ({
  ...(json ? { 'content-type': 'application/json' } : {}),
  ...(key === undefined ? {} : { authorization: `Bearer ${key}` }),
})

/** One answer of the responses API, read part by part from its stream of events. */
async function* replied(o: ReplyRequest): AsyncGenerator<ReplyPart> {
  const answer = await sent(o, `${baseOf(o.model, own)}/responses`, {
    method: 'POST',
    headers: headersOf(o.key),
    body: JSON.stringify(bodyOf(o)),
  })
  let text = ''
  let done: Record<string, unknown> | undefined
  let refused = false
  const raw: unknown[] = []
  for await (const event of eventsOf(answer.body)) {
    const data = dataOf(event)
    if (!data) continue
    raw.push(data)
    const type = data.type ?? event.event
    if (type === 'response.output_text.delta') {
      text += String(data.delta)
      yield { text: String(data.delta) }
    } else if (type === 'response.reasoning_summary_text.delta') yield { reasoning: String(data.delta) }
    else if (type === 'response.refusal.delta' || type === 'response.refusal.done') refused = true
    else if (type === 'response.completed' || type === 'response.incomplete' || type === 'response.failed')
      done = Object(data.response)
    else if (type === 'error') {
      const code = String(data.code ?? '')
      throw new ProviderFailure(/rate|overload|busy/i.test(code) ? 'busy' : 'server', String(data.message ?? 'error'))
    }
  }
  if (refused) throw new ProviderFailure('refused', 'The model refused.')
  if (!done) throw new ProviderFailure('server', 'The stream ended before the answer did.')
  const reason = Reflect.get(Object(done.incomplete_details), 'reason')
  if (done.status === 'incomplete' && reason === 'content_filter')
    throw new ProviderFailure('refused', 'The model refused.')
  if (done.status === 'incomplete') throw new ProviderFailure('cutOff', 'The answer reached its length.')
  if (done.status === 'failed') throw new ProviderFailure('server', String(Reflect.get(Object(done.error), 'message')))
  const calls: ToolCall[] = []
  const keep: unknown[] = []
  for (const item of Array.isArray(done.output) ? done.output : []) {
    const one: Record<string, unknown> = Object(item)
    if (one.type === 'function_call')
      calls.push({ id: String(one.call_id), tool: String(one.name), input: parsedOr(String(one.arguments ?? '')) })
    else if (one.type === 'reasoning') keep.push(one)
    // What the server's own tools did is handed back with the next request of the run, as it came.
    else if (one.type === 'web_search_call' || one.type === 'code_interpreter_call') keep.push(one)
    else if (one.type === 'message')
      for (const part of Array.isArray(one.content) ? one.content : [])
        if (Reflect.get(Object(part), 'type') === 'refusal') throw new ProviderFailure('refused', 'The model refused.')
  }
  const units = unitsOf(done.usage)
  const searches = (Array.isArray(done.output) ? done.output : []).filter(
    (item) => Reflect.get(Object(item), 'type') === 'web_search_call',
  ).length
  if (searches) units.webSearches = searches
  const end: ReplyEnd = { text, calls, units, raw }
  if (keep.length) end.keep = keep
  yield { end }
}

/** The provider `openai`: the responses API for writing, and its embeddings, its hearing and its speech. */
export const openai: Provider = {
  reply: (o) => replied(o),
  embed: (o) => vectors(o, `${baseOf(o.model, own)}/embeddings`),
  hear: (o) => heard(o, `${baseOf(o.model, own)}/audio/transcriptions`),
  speak: (o) => spoken(o, `${baseOf(o.model, own)}/audio/speech`),
}
