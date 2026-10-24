import type { None, Only, PlainOptions } from '../type.ts'

/** Takes the options of a value of any JSON. Answers the record of the type. */
export function json<const O extends PlainOptions = None>(o?: Only<O, PlainOptions>): { kind: 'json' } & NoInfer<O> {
  return Object.assign({ kind: 'json' as const }, o)
}
