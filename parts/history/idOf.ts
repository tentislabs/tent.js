import { fingerprintOf } from '../core/internal.ts'
import type { Point } from './point.ts'

/** A value as JSON with the keys of every map in code-unit order, no spaces, and a field that is not set left out. */
function compact(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(compact).join(',')}]`
  if (typeof value !== 'object' || value === null) return JSON.stringify(value) ?? 'null'
  const keys = Object.keys(value)
    .filter((key) => Reflect.get(value, key) !== undefined)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${keys.map((key) => `${JSON.stringify(key)}:${compact(Reflect.get(value, key))}`).join(',')}}`
}

/**
 * Takes what a point holds. Answers its id: the first 32 characters of the fingerprint of the record of its
 * moment, its writer, its files, its kind, its name and its parents, so that the same point has the same id on
 * every computer. What one computer found of it - `checked`, its description, its note - is no part of it.
 */
export function idOf(point: Omit<Point, 'id'>): string {
  const { at, by, files, kind, name, parents } = point
  return fingerprintOf(new TextEncoder().encode(compact({ at, by, files, kind, name, parents }))).slice(0, 32)
}
