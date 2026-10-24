import { sizedWritten } from './word.ts'

/** The key that a place names, as JavaScript makes one of it. A place that is worked out to a list is held to the size of a value before it is written. */
export function keyOf(place: unknown): string | symbol | number {
  if (typeof place === 'symbol' || typeof place === 'number') return place
  sizedWritten('a place that is worked out', [place])
  return String(place)
}

/** Takes a value and a place. Answers what the place holds, read as JavaScript reads it: it throws a TypeError for nothing, and a text and a number have places too. */
export function placeOf(value: unknown, place: unknown): unknown {
  if (value === undefined || value === null)
    throw new TypeError(`Cannot read properties of ${value} (reading '${String(place)}')`)
  return Reflect.get(Object(value), keyOf(place), value)
}

const runtimePlaces = new Set(['constructor', '__proto__', 'prototype'])

/** Whether a place is one through which lies the runtime itself, which a sequence that a model wrote never reads. */
export const throughRuntime = (place: unknown): boolean => typeof place === 'string' && runtimePlaces.has(place)

/** Takes a value and a place. Answers what the place holds as a sequence that a model wrote reads it: nothing for a place through which lies the runtime. */
export const sequencePlace = (value: unknown, place: unknown): unknown =>
  throughRuntime(place) ? undefined : placeOf(value, place)
