import type { Description } from '../core/internal.ts'
import { fingerprintOf, isStored } from '../core/internal.ts'
import { lockPrint, pathPrint, reachPrint } from './reach.ts'
import type { Work } from './work.ts'

/** What a result of a test stands on, as a project gives it: each definition, each file named, and the packages. */
export interface Prints {
  // Of each definition, by its name: its stored record with every file that the file it lies in reaches.
  definitions: Record<string, string>
  // Of each file named, by its path from the folder of the project: its text with every file it reaches.
  files: Record<string, string>
  lock: string
}

// The parts of a description that hold definitions.
const parts = [
  'tables',
  'functions',
  'flows',
  'screens',
  'components',
  'services',
  'models',
  'routes',
  'incoming',
  'commands',
] as const

const print = (text: string): string => fingerprintOf(new TextEncoder().encode(text))

/**
 * Takes what a build of a project read, its description, and paths from its folder. Answers the fingerprint of each
 * definition, by its stored record and every file its file reaches, of each file named with every file it reaches,
 * and of the packages the project has installed.
 */
export function printsOf(work: Work, description: Description, paths: string[]): Prints {
  const definitions: Record<string, string> = {}
  for (const part of parts)
    for (const [name, record] of Object.entries(description[part])) {
      const place: unknown = Object.hasOwn(description.places, name) ? description.places[name] : undefined
      const path: unknown = isStored(place) ? place.file : undefined
      const file = typeof path === 'string' ? work.files.get(path) : undefined
      definitions[name] = print(`${part}\n${name}\n${JSON.stringify(record)}\n${file ? reachPrint(work, file) : ''}`)
    }
  return {
    definitions,
    files: Object.fromEntries(paths.map((path) => [path, pathPrint(work, path)])),
    lock: lockPrint(work),
  }
}
