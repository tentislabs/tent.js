import { isStored } from '../../core/internal.ts'
import type { Described } from '../compare/definitions.ts'
import type { Stored } from '../compare/stored.ts'

// The parts of a description that hold definitions by their names, each with the word of one.
const parts: [string, string][] = [
  ['tables', 'table'],
  ['functions', 'function'],
  ['flows', 'flow'],
  ['screens', 'screen'],
  ['components', 'component'],
  ['services', 'service'],
  ['models', 'model'],
  ['routes', 'route'],
  ['incoming', 'incoming'],
  ['commands', 'command'],
  ['backfills', 'backfill'],
]

/** One definition of a description: the part that holds it, its word, and its stored record. */
export interface Defined {
  part: string
  what: string
  record: Stored
}

/** The definition of a name in a description, or nothing where it holds none. The project is a definition too. */
export function definedAs(description: Described, name: string): Defined | undefined {
  for (const [part, word] of parts) {
    const all = description[part]
    const record = isStored(all) ? all[name] : undefined
    if (isStored(record)) {
      const what = part === 'functions' ? String(record.kind ?? word) : isStored(record.agent) ? 'agent' : word
      return { part, what, record }
    }
  }
  const app = isStored(description.app) ? description.app : {}
  if (app.name === name && isStored(description.project))
    return { part: 'project', what: 'project', record: description.project }
  return undefined
}

/** Whether a definition is code: its record says so, and a route, a command, a screen and a component always are. */
export const isCode = (defined: Defined): boolean =>
  defined.record.form === 'code' || ['routes', 'commands', 'screens', 'components'].includes(defined.part)

/** The place of each definition that a file holds, by its name: its first and its last character there. */
export function placesIn(description: Described | undefined, path: string): Map<string, { from: number; to: number }> {
  const found = new Map<string, { from: number; to: number }>()
  const places = isStored(description?.places) ? description.places : {}
  for (const [name, place] of Object.entries(places))
    if (isStored(place) && place.file === path && typeof place.from === 'number' && typeof place.to === 'number')
      found.set(name, { from: place.from, to: place.to })
  return found
}

/** The place in a text of a character that is counted with one line ending, as the description counts it. */
export function rawAt(text: string, at: number): number {
  let seen = 0
  for (let k = 0; k < text.length; k++) {
    if (text[k] === '\r' && text[k + 1] === '\n') continue
    if (seen === at) return k
    seen++
  }
  return text.length
}

// The maps of a description, which its stored bytes leave out where they hold nothing.
const maps = [
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
  'backfills',
  'messages',
  'assets',
  'sources',
  'places',
]

/** A description as it was kept with a point, with each map that its bytes left out for holding nothing. */
export function filledIn(described: Described | undefined): Described | undefined {
  if (!described) return undefined
  const filled: Described = { ...described }
  for (const name of maps) if (!isStored(filled[name])) filled[name] = {}
  return filled
}

/** The names of every definition that a description holds, the project among them. */
export function definitionNames(description: Described | undefined): Set<string> {
  const names = new Set<string>()
  for (const [part] of parts)
    for (const name of Object.keys(isStored(description?.[part]) ? Object(description?.[part]) : {})) names.add(name)
  const app = isStored(description?.app) ? description.app : {}
  if (typeof app.name === 'string') names.add(app.name)
  return names
}
