import type { None, Only, PlainOptions } from '../type.ts'

/** Takes the options of a moment in time. Answers the record of the type. */
export function date<const O extends PlainOptions = None>(o?: Only<O, PlainOptions>): { kind: 'date' } & NoInfer<O> {
  return Object.assign({ kind: 'date' as const }, o)
}
