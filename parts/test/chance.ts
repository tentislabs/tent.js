import { randomBytes } from 'node:crypto'
import { noteSeed, seededSource, testUnderWay } from '../engine/index.ts'

/**
 * Takes the random seed a test app was opened with, where the test named one. Answers the seed and the source of
 * numbers made from it, which the app draws everything from: its words `random()` and `token()`, its row ids, and the
 * runtime's own `Math.random` in its code. Where none is named it is the name of the test that runs, as `tent test`
 * runs it, so the same test draws the same numbers on every computer; outside it, a seed drawn anew. The seed is
 * noted for the test, so that a failure of it prints it and a run with it fails the same way.
 */
export function chanceOf(named?: string): { seed: string; random: () => number } {
  const test = testUnderWay()
  const name: unknown = test === undefined ? undefined : JSON.parse(test)[1]
  const seed = named ?? (typeof name === 'string' ? name : randomBytes(12).toString('base64url'))
  noteSeed(seed)
  return { seed, random: seededSource(seed) }
}
