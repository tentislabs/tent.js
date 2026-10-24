import { between, later, TentError } from '../core/index.ts'

const start = new Date(0)

/**
 * Takes a length of time: in words, as `'3 days'`, or in milliseconds, as a limit is stored. Answers its
 * milliseconds. Throws T0027 for words that do not read.
 */
export function msOf(length: string | number): number {
  if (typeof length === 'number') return length
  return later(start, length).getTime()
}

/**
 * Takes what a wait is handed, and the present moment. Answers the moment the wait ends: a `Date`, and a text that
 * is a moment in the standard form, is that moment, and any other text is a length from now. Throws T0027 for
 * what is neither.
 */
export function momentOf(time: string | Date, now: number): number {
  if (time instanceof Date) return time.getTime()
  let asMoment: number | undefined
  try {
    asMoment = between(start, time, 'ms')
  } catch {
    // What is no moment may still be a length.
  }
  if (typeof asMoment === 'number') return asMoment
  try {
    return now + msOf(time)
  } catch {
    throw new TentError(
      'T0027',
      `A wait cannot work out ${JSON.stringify(time)}: it is neither a moment nor a length of time.`,
      {
        fix: "Hand the wait a length, as `'3 days'`, or a moment: a `Date`, or its text in the standard form.",
      },
    )
  }
}
