import type { OneOfType, ShapeOptions, Type } from '../type.ts'

/** Takes the types of which a value fits one, and the options. Answers the record of the shape. */
export function oneOf(of: readonly Type[], o?: ShapeOptions): OneOfType {
  return { kind: 'oneOf', of, ...o }
}
