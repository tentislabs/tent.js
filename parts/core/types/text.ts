import type { None, Only, TextOptions } from '../type.ts'

/** Takes the options of a text. Answers the record of the type. */
export function text<const O extends TextOptions = None>(o?: Only<O, TextOptions>): { kind: 'text' } & NoInfer<O> {
  return Object.assign({ kind: 'text' as const }, o)
}
