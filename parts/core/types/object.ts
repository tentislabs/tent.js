import type { None, Only, PlainOptions, Type } from '../type.ts'

/** Takes the type of each field, by its name, and the options. Answers the record of the type. */
export function object<Shape extends { readonly [field: string]: Type }, const O extends PlainOptions = None>(
  shape: Shape,
  o?: Only<O, PlainOptions>,
): { kind: 'object'; shape: Shape } & NoInfer<O> {
  return Object.assign({ kind: 'object' as const, shape }, o)
}
