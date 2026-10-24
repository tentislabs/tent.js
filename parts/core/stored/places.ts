import type { Stored } from '../record.ts'
import type { Loaded } from './shared.ts'

/**
 * Takes the definitions that were described, each by its name with what the build handed of it. Answers the place
 * of each one that the build gave a file and its first and last character there.
 */
export function placesOf(all: Iterable<[string, { loaded: Loaded }]>): Record<string, Stored> {
  const places: Record<string, Stored> = {}
  for (const [name, { loaded }] of all) {
    const { file, from, to } = loaded
    if (file !== undefined && from !== undefined && to !== undefined) places[name] = { file, from, to }
  }
  return places
}
