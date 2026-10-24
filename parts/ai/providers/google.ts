import type { Base, Message, Provider, ReplyEnd, ReplyPart, ReplyRequest, ToolCall, Units } from '../face.ts'
import { providerAddresses, ProviderFailure } from '../../core/internal.ts'
import { eventsOf } from '../../connect/index.ts'
import { dataOf } from './events.ts'
import { base64, baseOf, jsonOf, numberAt, optionsOf, sent } from './sent.ts'

// The API of Gemini, as `sources.md` holds it. 503 is the status by which its documents name a server too busy.
const own = `${providerAddresses.google}/v1beta`
const busy = [503]

// The reasons by which its server ends an answer that it refused to give.
const refusals = ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION', 'IMAGE_SAFETY']

type Part = Record<string, unknown>

/** The parts of one message, in the form of the API. */
function partsOf(message: Message, names: Map<string, string>): Part[] {
  if (message.who === 'tool') {
    const response = message.error === undefined ? { result: message.result } : { error: message.error }
    return [
      {
        functionResponse: {
          ...(message.id ? { id: message.id } : {}),
          name: names.get(message.id ?? '') ?? '',
          response,
        },
      },
    ]
  }
  const parts: Part[] = []
  // What the provider asked to be handed back, the parts that carry the model's signatures, stands as it came.
  if (message.who === 'assistant' && Array.isArray(message.keep))
    for (const one of message.keep) parts.push(Object(one))
  for (const image of message.images ?? [])
    parts.push({ inlineData: { mimeType: image.kind, data: base64(image.bytes) } })
  if (message.text !== undefined && message.text !== '' && !Array.isArray(message.keep))
    parts.push({ text: message.text })
  for (const call of message.calls ?? [])
    if (!Array.isArray(message.keep)) parts.push({ functionCall: { id: call.id, name: call.tool, args: call.input } })
  return parts
}

/** The contents of a request, in turns: a tool's answer is a part of the user's side, named by the call it answers. */
function contentsOf(messages: Message[]): { role: string; parts: Part[] }[] {
  const names = new Map<string, string>()
  for (const message of messages) for (const call of message.calls ?? []) names.set(call.id, call.tool)
  const turns: { role: string; parts: Part[] }[] = []
  for (const message of messages) {
    const role = message.who === 'assistant' ? 'model' : 'user'
    const parts = partsOf(message, names)
    if (!parts.length) continue
    const last = turns.at(-1)
    if (last?.role === role) last.parts.push(...parts)
    else turns.push({ role, parts })
  }
  return turns
}

/** The tools that the server runs itself, by the name a model states them under, in the form of the API of Gemini. */
const hostedForms: Record<string, Record<string, unknown>> = {
  webSearch: { google_search: {} },
  urlContext: { url_context: {} },
  codeExecution: { code_execution: {} },
}

/** The body of a request. */
function bodyOf(o: ReplyRequest): Record<string, unknown> {
  const options = optionsOf(o.model)
  const config: Record<string, unknown> = Object(options.generationConfig)
  const tools = (o.tools ?? []).map((one) => ({ name: one.name, description: one.about, parameters: one.input }))
  // The server's own tools stand beside the declarations of the functions, each in the form its server names it.
  const hosted = (o.hosted ?? []).filter((name) => Object.hasOwn(hostedForms, name)).map((name) => hostedForms[name])
  const all = [...(tools.length ? [{ functionDeclarations: tools }] : []), ...hosted]
  return {
    ...options,
    ...(o.instructions ? { systemInstruction: { parts: [{ text: o.instructions }] } } : {}),
    contents: contentsOf(o.messages),
    ...(all.length ? { tools: all } : {}),
    ...(o.shape || Object.keys(config).length
      ? {
          generationConfig: {
            ...config,
            ...(o.shape ? { responseMimeType: 'application/json', responseJsonSchema: o.shape } : {}),
          },
        }
      : {}),
  }
}

/** What the server reported it used: the tokens read, those of a kept start among them, and those written. */
function unitsOf(usage: unknown): Units {
  const units: Units = {}
  const tokensIn = numberAt(usage, 'promptTokenCount')
  const out = numberAt(usage, 'candidatesTokenCount')
  const thoughts = numberAt(usage, 'thoughtsTokenCount')
  const cached = numberAt(usage, 'cachedContentTokenCount')
  if (tokensIn !== undefined) units.tokensIn = tokensIn
  if (out !== undefined || thoughts !== undefined) units.tokensOut = (out ?? 0) + (thoughts ?? 0)
  if (cached !== undefined) units.tokensCached = cached
  return units
}

/** The headers of every request. */
const headersOf = (key: string | undefined): Record<string, string> => ({
  'content-type': 'application/json',
  ...(key === undefined ? {} : { 'x-goog-api-key': key }),
})

/** The address of a method of the model. */
const addressOf = (o: Base, method: string): string =>
  `${baseOf(o.model, own)}/models/${encodeURIComponent(String(o.model.name))}:${method}`

/** One answer of the API, read part by part from its stream of events. */
async function* replied(o: ReplyRequest): AsyncGenerator<ReplyPart> {
  const answer = await sent(
    o,
    `${addressOf(o, 'streamGenerateContent')}?alt=sse`,
    { method: 'POST', headers: headersOf(o.key), body: JSON.stringify(bodyOf(o)) },
    busy,
  )
  let text = ''
  let finish: unknown
  let usage: unknown
  const calls: ToolCall[] = []
  const keep: Part[] = []
  const raw: unknown[] = []
  for await (const event of eventsOf(answer.body)) {
    const data = dataOf(event)
    if (!data) continue
    raw.push(data)
    if (data.error !== undefined)
      throw new ProviderFailure('server', String(Reflect.get(Object(data.error), 'message') ?? 'error'))
    if (Reflect.get(Object(data.promptFeedback), 'blockReason') !== undefined)
      throw new ProviderFailure('refused', 'The model refused.')
    if (data.usageMetadata) usage = data.usageMetadata
    for (const candidate of Array.isArray(data.candidates) ? data.candidates : []) {
      const one: Record<string, unknown> = Object(candidate)
      if (one.finishReason) finish = one.finishReason
      for (const part of Array.isArray(Reflect.get(Object(one.content), 'parts'))
        ? Reflect.get(Object(one.content), 'parts')
        : []) {
        const piece: Part = Object(part)
        keep.push(piece)
        if (piece.thought === true && typeof piece.text === 'string') yield { reasoning: piece.text }
        else if (typeof piece.text === 'string') {
          text += piece.text
          yield { text: piece.text }
        } else if (piece.functionCall) {
          const call: Record<string, unknown> = Object(piece.functionCall)
          calls.push({
            id: typeof call.id === 'string' ? call.id : `call-${calls.length + 1}`,
            tool: String(call.name),
            input: call.args ?? {},
          })
        }
      }
    }
  }
  if (typeof finish === 'string' && refusals.includes(finish))
    throw new ProviderFailure('refused', 'The model refused.')
  if (finish === 'MAX_TOKENS') throw new ProviderFailure('cutOff', 'The answer reached its length.')
  const end: ReplyEnd = { text, calls, units: unitsOf(usage), raw }
  // The parts are handed back whole where they carry a signature of the model's thinking.
  if (keep.some((one) => one.thoughtSignature !== undefined)) end.keep = keep
  yield { end }
}

/** The vectors of texts, from the embeddings of the API, one request for all of them. */
async function vectors(o: Base & { texts: string[] }): Promise<{ vectors: number[][]; raw?: unknown }> {
  const model = `models/${String(o.model.name)}`
  const answer = await sent(
    o,
    addressOf(o, 'batchEmbedContents'),
    {
      method: 'POST',
      headers: headersOf(o.key),
      body: JSON.stringify({ requests: o.texts.map((text) => ({ model, content: { parts: [{ text }] } })) }),
    },
    busy,
  )
  const read = await jsonOf(answer)
  const made = (Array.isArray(read.embeddings) ? read.embeddings : []).map((one) => {
    const values: unknown = Reflect.get(Object(one), 'values')
    return Array.isArray(values) ? values.map(Number) : []
  })
  if (made.length !== o.texts.length) throw new ProviderFailure('server', 'The server gave another number of vectors.')
  return { vectors: made }
}

/** The provider `google`: the API of Gemini, for writing and for embeddings. */
export const google: Provider = {
  reply: (o) => replied(o),
  embed: (o) => vectors(o),
}
