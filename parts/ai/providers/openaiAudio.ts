import type { Base, Units } from '../face.ts'
import { ProviderFailure } from '../../core/internal.ts'
import { jsonOf, numberAt, sent } from './sent.ts'

// The embeddings, the hearing and the speech of the API of OpenAI, which open-model servers speak at the same paths.

const authOf = (key: string | undefined): Record<string, string> =>
  key === undefined ? {} : { authorization: `Bearer ${key}` }

/** The vectors of texts, in the order of the texts, from the embeddings of the API. */
export async function vectors(
  o: Base & { texts: string[] },
  address: string,
): Promise<{ vectors: number[][]; units?: Units; raw?: unknown }> {
  const answer = await sent(o, address, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authOf(o.key) },
    body: JSON.stringify({ model: o.model.name, input: o.texts }),
  })
  const read = await jsonOf(answer)
  const data = Array.isArray(read.data) ? read.data.map((one) => Object(one)) : []
  const sorted = [...data].sort((a, b) => Number(a.index ?? 0) - Number(b.index ?? 0))
  const made = sorted.map((one) => (Array.isArray(one.embedding) ? one.embedding.map(Number) : []))
  if (made.length !== o.texts.length) throw new ProviderFailure('server', 'The server gave another number of vectors.')
  const tokensIn = numberAt(read, 'usage.prompt_tokens')
  return { vectors: made, ...(tokensIn === undefined ? {} : { units: { tokensIn } }), raw: { usage: read.usage } }
}

/** The length of a recording in seconds, where it is a WAV file whose header says it. */
function secondsOfWave(audio: Uint8Array): number | undefined {
  const view = new DataView(audio.buffer, audio.byteOffset, audio.byteLength)
  if (audio.byteLength < 44 || view.getUint32(0, false) !== 0x52494646 || view.getUint32(8, false) !== 0x57415645)
    return undefined
  const rate = view.getUint32(28, true)
  return rate > 0 ? (audio.byteLength - 44) / rate : undefined
}

/** The ending of a file of a kind, which the server reads the kind of the recording by. */
const endingOf = (kind: string): string =>
  ({
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/mpeg': 'mp3',
    'audio/ogg': 'ogg',
    'audio/webm': 'webm',
    'audio/mp4': 'm4a',
  })[kind] ?? 'webm'

/** The text of a recording, its language and its length, from the transcriptions of the API. */
export async function heard(
  o: Base & { audio: Uint8Array; kind: string; language?: string; hint?: string },
  address: string,
): Promise<{ text: string; language?: string; seconds: number; units?: Units; raw?: unknown }> {
  const form = new FormData()
  form.set('file', new Blob([new Uint8Array(o.audio)], { type: o.kind }), `recording.${endingOf(o.kind)}`)
  form.set('model', String(o.model.name))
  // Only the first model of the API gives the language and the length of what it heard.
  const verbose = String(o.model.name).startsWith('whisper')
  form.set('response_format', verbose ? 'verbose_json' : 'json')
  if (o.language !== undefined) form.set('language', o.language)
  if (o.hint !== undefined) form.set('prompt', o.hint)
  const answer = await sent(o, address, { method: 'POST', headers: authOf(o.key), body: form })
  const read = await jsonOf(answer)
  const seconds = numberAt(read, 'duration') ?? numberAt(read, 'usage.seconds') ?? secondsOfWave(o.audio) ?? 0
  const language = typeof read.language === 'string' ? read.language : o.language
  const units: Units = {}
  const tokensIn = numberAt(read, 'usage.input_tokens')
  const tokensOut = numberAt(read, 'usage.output_tokens')
  if (tokensIn !== undefined) units.tokensIn = tokensIn
  if (tokensOut !== undefined) units.tokensOut = tokensOut
  return {
    text: String(read.text ?? ''),
    ...(language ? { language } : {}),
    seconds,
    units,
    raw: { usage: read.usage },
  }
}

/** The sound of a text, from the speech of the API. */
export async function spoken(
  o: Base & { text: string; voice?: string; format: 'mp3' | 'wav' | 'opus'; speed?: number },
  address: string,
): Promise<{ audio: Uint8Array; units?: Units; raw?: unknown }> {
  const answer = await sent(o, address, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authOf(o.key) },
    body: JSON.stringify({
      model: o.model.name,
      input: o.text,
      voice: o.voice ?? 'alloy',
      response_format: o.format,
      ...(o.speed === undefined ? {} : { speed: o.speed }),
    }),
  })
  return { audio: new Uint8Array(await answer.arrayBuffer()) }
}
