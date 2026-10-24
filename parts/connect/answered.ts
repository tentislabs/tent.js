import type { Caller, Type } from '../core/index.ts'
import { TentError } from '../core/index.ts'
import { checkValue } from '../core/internal.ts'
import { isType } from './callInput.ts'
import type { ConnectEnv } from './env.ts'

/** The endings of the kinds of file a service may answer, for a file that the answer names no name for. */
const endings: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/json': 'json',
  'application/zip': 'zip',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'text/html': 'html',
  'audio/mpeg': 'mp3',
  'video/mp4': 'mp4',
}

/** The ending of a name of a file of a kind, with its dot: nothing for a kind that has none here. */
export const endingOf = (kind: string): string => (Object.hasOwn(endings, kind) ? `.${endings[kind]}` : '')

/** A value with nothing in it that its type does not name: a `null` counts as a value that is not there. */
function filtered(type: Type, value: unknown): unknown {
  if (value === undefined || value === null) return undefined
  if (type.kind === 'list' && Array.isArray(value)) return value.map((one) => filtered(type.of, one))
  if (type.kind === 'object' && typeof value === 'object' && !Array.isArray(value)) {
    const made: Record<string, unknown> = {}
    for (const [name, field] of Object.entries(type.shape)) {
      const one = filtered(field, Reflect.get(value, name))
      if (one !== undefined) made[name] = one
    }
    return made
  }
  return value
}

/** The kind that an answer states, without what follows a semicolon. */
const kindOf = (answer: Response): string =>
  (answer.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()

/** Whether an answer says that its body is JSON. */
export const saysJson = (answer: Response): boolean => /^application\/([\w.+-]+\+)?json$/.test(kindOf(answer))

/** The name that an answer states for its file, by the standard line that sends a file. */
function statedName(answer: Response): string | undefined {
  const line = answer.headers.get('content-disposition') ?? ''
  const wide = /filename\*\s*=\s*[^']*'[^']*'([^;]+)/i.exec(line)
  if (wide) {
    try {
      return decodeURIComponent(wide[1].trim())
    } catch {
      // A name that does not read is left for the plain one.
    }
  }
  const plain = /filename\s*=\s*"([^"]*)"|filename\s*=\s*([^;]+)/i.exec(line)
  const name = plain?.[1] ?? plain?.[2]?.trim()
  return name ? name.replace(/[/\\]/g, '_') : undefined
}

/** The error of an answer that does not fit the output of its call. */
const misfit = (name: string, words: string): TentError =>
  new TentError('T7116', `The answer of ${name} does not fit its output: ${words}`, {
    fix: 'State an `output` that the answer of the service fits, or leave it out to take the answer as it comes.',
  })

/**
 * Takes what the engine hands `connect`, the name of a call and its record, the answer of the service, and the
 * caller. Reads the answer: with a stated `output`, as JSON checked against the type and filtered through it,
 * T7116 where it does not fit; with `output: file()`, as a loose file of the caller, whose id it answers; with none,
 * as JSON where it says so and as text otherwise. An answer with no body answers nothing. `seen` is told what was
 * read as JSON, whole, before it is filtered.
 */
export async function answerOf(
  env: ConnectEnv,
  name: string,
  call: Record<string, unknown>,
  answer: Response,
  caller: Caller,
  seen?: (whole: unknown) => void,
): Promise<unknown> {
  const output = isType(call.output) ? call.output : undefined
  if (output?.kind === 'file') {
    const kind = kindOf(answer) || 'application/octet-stream'
    // A name with no ending of its own is given the ending of the kind its bytes say, where the file is kept.
    const fileName = statedName(answer) ?? String(name.split('.').pop())
    const bytes = new Uint8Array(await answer.arrayBuffer())
    return env.files.put(new Blob([bytes]).stream(), { name: fileName, kind }, { caller })
  }
  const text = await answer.text()
  if (!output) {
    if (text === '') return undefined
    if (!saysJson(answer)) return text
    try {
      const whole: unknown = JSON.parse(text)
      seen?.(whole)
      return whole
    } catch {
      return text
    }
  }
  if (text === '') {
    if (output.optional === true) return undefined
    throw misfit(name, 'the answer has no body.')
  }
  let read: unknown
  try {
    read = JSON.parse(text)
  } catch {
    throw misfit(name, 'the answer is no JSON.')
  }
  seen?.(read)
  const value = filtered(output, read)
  const [found] = value === undefined && output.optional === true ? [] : checkValue(output, value)
  if (found) throw misfit(name, found.message)
  return value
}
