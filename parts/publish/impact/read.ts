import type { Description } from '../../core/internal.ts'
import { isStored } from '../../core/internal.ts'

/** A stored record of a description. */
export type Stored = Record<string, unknown>

/** The records of one part of a description by their names, as a part that is none holds no record. */
export function recordsOf(description: Description, part: string): Record<string, Stored> {
  const held: unknown = Reflect.get(description, part)
  const records: Record<string, Stored> = {}
  for (const [name, record] of Object.entries(isStored(held) ? held : {})) if (isStored(record)) records[name] = record
  return records
}

/** The file a definition lies in, by the place the description keeps of it: a column, a step and a tool by their owner's. */
export function fileOf(description: Description, name: string): string {
  const owner = name.split('.')[0]
  const places: unknown = Reflect.get(description, 'places')
  const place: unknown = isStored(places) ? places[owner] : undefined
  const file: unknown = isStored(place) ? place.file : undefined
  return typeof file === 'string' ? file : ''
}

/** What kind a definition is, in the word of a change: a function by its kind, a flow, an agent, a screen, a table. */
export function kindOf(description: Description, name: string): string {
  const fn = recordsOf(description, 'functions')[name]
  if (fn) return String(fn.kind ?? 'function')
  const flow = recordsOf(description, 'flows')[name]
  if (flow) return isStored(flow.agent) ? 'agent' : 'flow'
  for (const [part, word] of [
    ['tables', 'table'],
    ['screens', 'screen'],
    ['components', 'component'],
    ['services', 'service'],
    ['models', 'model'],
    ['routes', 'route'],
    ['backfills', 'backfill'],
  ])
    if (recordsOf(description, part)[name]) return word
  return 'definition'
}

// How narrow a rule is, from the widest.
const narrowness: Record<string, number> = { anyone: 0, signedIn: 1, owner: 2, role: 2, where: 2, allow: 2, nobody: 3 }

/** How narrow a stored rule is: one that is no rule lets nobody in. */
export const rankOf = (rule: unknown): number => (isStored(rule) ? (narrowness[String(rule.rule)] ?? 3) : 3)

/** Who a rule lets in, in words. */
export function whoOf(rule: unknown): string {
  const stored = isStored(rule) ? rule : {}
  if (stored.rule === 'anyone') return 'anyone'
  if (stored.rule === 'signedIn') return 'any signed-in person'
  if (stored.rule === 'role') return `the role ${String(stored.role)}`
  if (stored.rule === 'owner') return 'the owner of a row'
  return 'whom its rule lets in'
}

/** The name of a door in words. */
export const doorOf = (door: string): string =>
  door === 'api' ? 'the API' : door === 'mcp' ? 'MCP' : door === 'cli' ? 'the command line' : door

/** Whether a type lets a value be left out: it is optional, or has a default. */
export const leftOut = (type: unknown): boolean =>
  isStored(type) && (type.optional === true || type.default !== undefined)

/** A stored list as its texts: a value that is no list holds none. */
export const listOf = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : [])

/** The doors a definition is offered to. */
export const doorsOf = (record: Stored | undefined): string[] =>
  Array.isArray(record?.offer) ? record.offer.map(String) : []

// The parts that a description may leave out where they hold nothing, which what reads one asks for by name.
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
]

/** A description with every part that it left out as an empty one. */
export const wholeOf = (description: Description): Description =>
  Object({ ...Object.fromEntries(parts.map((part) => [part, {}])), ...description })
