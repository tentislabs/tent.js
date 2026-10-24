import type { Provider, ReplyEnd, ReplyPart, ReplyRequest, ToolCall, Units } from '../face.ts'
import { ProviderFailure } from '../../core/internal.ts'
import { eventsOf } from '../../connect/index.ts'
import { dataOf } from './events.ts'
import { headersOf } from './openai.ts'
import { heard, spoken, vectors } from './openaiAudio.ts'
import { base64, baseOf, numberAt, optionsOf, parsedOr, sent } from './sent.ts'

// The older format of OpenAI, its chat completions, which open-model servers speak at the `url` a model states.

/** The base of the addresses: the `url` of the model, which a server of this format has no other of. */
function own(model: Record<string, unknown>): string {
  if (typeof model.url === 'string' && model.url !== '') return baseOf(model, model.url)
  throw new ProviderFailure(
    'notAccepted',
    `The model ${String(model.name)} of the provider openai-style states no url.`,
  )
}

/** The messages of a request, in the form of the chat completions. */
function messagesOf(o: ReplyRequest): Record<string, unknown>[] {
  const messages: Record<string, unknown>[] = []
  if (o.instructions) messages.push({ role: 'system', content: o.instructions })
  for (const message of o.messages) {
    if (message.who === 'tool') {
      const content =
        message.error ?? (typeof message.result === 'string' ? message.result : JSON.stringify(message.result))
      messages.push({ role: 'tool', tool_call_id: message.id ?? '', content: content ?? '' })
      continue
    }
    const calls = (message.calls ?? []).map((call) => ({
      id: call.id,
      type: 'function',
      function: { name: call.tool, arguments: JSON.stringify(call.input) },
    }))
    const images = message.images ?? []
    const content = images.length
      ? [
          ...images.map((image) => ({
            type: 'image_url',
            image_url: { url: `data:${image.kind};base64,${base64(image.bytes)}` },
          })),
          ...(message.text ? [{ type: 'text', text: message.text }] : []),
        ]
      : (message.text ?? '')
    messages.push({ role: message.who, content, ...(calls.length ? { tool_calls: calls } : {}) })
  }
  return messages
}

/** The body of a request. */
function bodyOf(o: ReplyRequest): Record<string, unknown> {
  const tools = (o.tools ?? []).map((one) => ({
    type: 'function',
    function: { name: one.name, description: one.about, parameters: one.input },
  }))
  return {
    model: o.model.name,
    ...optionsOf(o.model),
    messages: messagesOf(o),
    ...(tools.length ? { tools } : {}),
    ...(o.shape ? { response_format: { type: 'json_schema', json_schema: { name: 'answer', schema: o.shape } } } : {}),
    stream: true,
    stream_options: { include_usage: true },
  }
}

/** What the server reported it used. */
function unitsOf(usage: unknown): Units {
  const units: Units = {}
  const tokensIn = numberAt(usage, 'prompt_tokens')
  const tokensOut = numberAt(usage, 'completion_tokens')
  const cached = numberAt(usage, 'prompt_tokens_details.cached_tokens')
  if (tokensIn !== undefined) units.tokensIn = tokensIn
  if (tokensOut !== undefined) units.tokensOut = tokensOut
  if (cached !== undefined) units.tokensCached = cached
  return units
}

/** One answer of the chat completions, read part by part from its stream of events. */
async function* replied(o: ReplyRequest): AsyncGenerator<ReplyPart> {
  const answer = await sent(o, `${own(o.model)}/chat/completions`, {
    method: 'POST',
    headers: headersOf(o.key),
    body: JSON.stringify(bodyOf(o)),
  })
  let text = ''
  let finish: unknown
  let usage: unknown
  let refused = false
  const building: { id: string; name: string; args: string }[] = []
  const raw: unknown[] = []
  for await (const event of eventsOf(answer.body)) {
    if (event.data.trim() === '[DONE]') break
    const data = dataOf(event)
    if (!data) continue
    raw.push(data)
    if (data.error !== undefined)
      throw new ProviderFailure('server', String(Reflect.get(Object(data.error), 'message') ?? 'error'))
    if (data.usage) usage = data.usage
    for (const choice of Array.isArray(data.choices) ? data.choices : []) {
      const one: Record<string, unknown> = Object(choice)
      if (one.finish_reason) finish = one.finish_reason
      const delta: Record<string, unknown> = Object(one.delta)
      if (typeof delta.reasoning_content === 'string' && delta.reasoning_content !== '')
        yield { reasoning: delta.reasoning_content }
      if (typeof delta.content === 'string' && delta.content !== '') {
        text += delta.content
        yield { text: delta.content }
      }
      if (typeof delta.refusal === 'string' && delta.refusal !== '') refused = true
      for (const call of Array.isArray(delta.tool_calls) ? delta.tool_calls : []) {
        const part: Record<string, unknown> = Object(call)
        const at = typeof part.index === 'number' ? part.index : building.length
        building[at] ??= { id: '', name: '', args: '' }
        const fn: Record<string, unknown> = Object(part.function)
        if (typeof part.id === 'string') building[at].id = part.id
        if (typeof fn.name === 'string') building[at].name += fn.name
        if (typeof fn.arguments === 'string') building[at].args += fn.arguments
      }
    }
  }
  if (refused || finish === 'content_filter') throw new ProviderFailure('refused', 'The model refused.')
  if (finish === 'length') throw new ProviderFailure('cutOff', 'The answer reached its length.')
  const calls: ToolCall[] = building
    .filter((one) => one !== undefined)
    .map((one, i) => ({ id: one.id || `call-${i + 1}`, tool: one.name, input: parsedOr(one.args) }))
  const end: ReplyEnd = { text, calls, units: unitsOf(usage), raw }
  yield { end }
}

/** The provider `openai-style`: the chat completions at the `url` of the model, with embeddings, hearing and speech. */
export const openaiStyle: Provider = {
  reply: (o) => replied(o),
  embed: (o) => vectors(o, `${own(o.model)}/embeddings`),
  hear: (o) => heard(o, `${own(o.model)}/audio/transcriptions`),
  speak: (o) => spoken(o, `${own(o.model)}/audio/speech`),
}
