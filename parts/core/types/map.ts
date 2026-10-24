import type { MapType, ShapeOptions, Type } from '../type.ts'

/** Takes the type of every value of a record with free keys, and the options. Answers the record of the shape. */
export function map(of: Type, o?: ShapeOptions): MapType {
  return { kind: 'map', of, ...o }
}
