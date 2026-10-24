import { TentError } from '../errors.ts'
import type { RefType, ShapeOptions, Type } from '../type.ts'

const kept = new Map<string, Type>()

/** Takes a name and a shape, and keeps the shape under the name, so that a shape can hold itself. Answers the shape. */
export function nameShape<Shape extends Type>(name: string, shape: Shape): Shape {
  kept.set(name, shape)
  return shape
}

/** Answers the shape that was kept under a name. Throws T0009 where nothing was kept under it. */
export function shapeOf(name: string): Type {
  const shape = kept.get(name)
  if (!shape) throw new TentError('T0009', `A shape names the shape ${name}, which nothing has kept.`)
  return shape
}

/** Takes the name of a kept shape, and the options. Answers the record of the shape, which stands for the kept one. */
export function ref(name: string, o?: ShapeOptions): RefType {
  return { kind: 'ref', name, ...o }
}
