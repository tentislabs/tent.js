import type { None, Only, PlainOptions } from '../type.ts'

/** Takes the options of a calendar day, which has no time and no zone. Answers the record of the type. */
export function day<const O extends PlainOptions = None>(o?: Only<O, PlainOptions>): { kind: 'day' } & NoInfer<O> {
  return Object.assign({ kind: 'day' as const }, o)
}
