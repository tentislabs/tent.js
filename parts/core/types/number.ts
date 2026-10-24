import type { None, NumberOptions, Only } from '../type.ts'

/** Takes the options of a number. Answers the record of the type. */
export function number<const O extends NumberOptions = None>(
  o?: Only<O, NumberOptions>,
): { kind: 'number' } & NoInfer<O> {
  return Object.assign({ kind: 'number' as const }, o)
}
