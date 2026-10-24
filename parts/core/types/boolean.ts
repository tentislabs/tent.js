import type { None, Only, PlainOptions } from '../type.ts'

/** Takes the options of a value that is true or false. Answers the record of the type. */
export function boolean<const O extends PlainOptions = None>(
  o?: Only<O, PlainOptions>,
): { kind: 'boolean' } & NoInfer<O> {
  return Object.assign({ kind: 'boolean' as const }, o)
}
