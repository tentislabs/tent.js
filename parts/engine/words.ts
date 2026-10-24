import { later, TentError } from '../core/index.ts'
import { sizeOf } from '../core/internal.ts'

/** The error of an option of the engine whose words do not read. */
const unread = (option: string, words: unknown, form: string): TentError =>
  new TentError('T0013', `The option \`${option}\` of the engine is ${JSON.stringify(words)}, which is no ${form}.`, {
    fix: "Write a length of time as '5 seconds' and a size as '16 KB'.",
  })

/**
 * Takes the name of an option, a length of time in words, as `'5 seconds'`, and what holds where none is given.
 * Answers the milliseconds. The words are read by the word that moves a moment, so that a length means one thing
 * everywhere. Throws T0013 for words that do not read.
 */
export function msOf(option: string, words: string | undefined, otherwise: number): number {
  if (words === undefined) return otherwise
  try {
    return later(new Date(0), words).getTime()
  } catch {
    throw unread(option, words, 'length of time')
  }
}

/**
 * Takes the name of an option, a size in words, a number and `KB`, `MB` or `GB` counted in 1,024s, and what holds
 * where none is given. Answers the bytes. Throws T0013 for words that do not read.
 */
export function bytesOf(option: string, words: string | undefined, otherwise: number): number {
  if (words === undefined) return otherwise
  const bytes = sizeOf(words)
  if (bytes === undefined) throw unread(option, words, 'size')
  return bytes
}
