import { TentError } from '../../core/index.ts'

/**
 * Takes what the work of a task failed with, and its wire form. Answers the wire form with the place of a call that
 * nobody agreed to, where the failure names one: its writer then has the step wait for the person.
 */
export function workPlaced(error: unknown, wire: object): object {
  if (!(error instanceof TentError) || error.code !== 'T7111' || !error.place) return wire
  return { ...wire, place: { name: error.place.name, nth: error.place.nth } }
}

/** The place that a failure sent by a worker names, where it names one. */
export function placeOfSent(sent: unknown): { name: string; nth: number } | undefined {
  const place: unknown = Reflect.get(Object(sent), 'place')
  const name: unknown = Reflect.get(Object(place), 'name')
  const nth: unknown = Reflect.get(Object(place), 'nth')
  return typeof name === 'string' && typeof nth === 'number' ? { name, nth } : undefined
}
