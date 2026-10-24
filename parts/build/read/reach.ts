import type { Node } from '../tree.ts'

/** What is known of a definition that a file names: its kind, its name, and for the project the options it writes. */
export interface Known {
  kind: string
  definition: string
  // A model that states `input` and `output` is also a function.
  called?: boolean
  // For the project: the stored value of one of its options, `{ nothing: true }` for one that is left out, and
  // nothing where the option holds no plain value written in place.
  option?(name: string): unknown
}

/** What a name is that a file imports. */
export type Imported =
  | { ours: string }
  | { app: Known }
  | { text: string; textFile: string }
  | { other: string }
  // A name that a sequence of an agent holds beside the words: a tool, the first name of a dotted one, or a word of a sequence.
  | { sequence: 'tool' | 'dotted' | 'call' | 'all' | 'fill' }

/** The names in reach while one arrow is read. */
export interface Reach {
  imports: Map<string, Imported>
  // The definitions that the file itself makes, by the name of their `const`.
  own: Map<string, Known>
  // Every other top-level name of the file: with its stored value where that is a plain value written in place.
  tops: Map<string, { value?: unknown }>
  // The names that the arrow is handed, and among them the one that is the `db`.
  handed: Set<string>
  db?: string
  scopes: Map<string, { chain: false | 'db' | 'table' }>[]
  // For a sequence: the names its tools are told under, and the line of a place, which each statement keeps.
  tools?: Set<string>
  lineOf?: (at: number) => number
  // For an arrow of a screen's `data`, `title` or search-engine fields: the words of a screen alone, and no call.
  screen?: true
}

/** Thrown where an arrow holds a thing that makes it code. */
export class NotPlain extends Error {
  thing: string
  at: number

  /** Takes the thing, in words, and the node it stands at. */
  constructor(thing: string, node: Node | undefined) {
    super(thing)
    this.thing = thing
    this.at = node?.start ?? 0
  }
}

/** Thrown where an arrow holds a thing that is an error in a body that was read and in code alike. */
export class Refused extends Error {
  code: string
  at: number

  /** Takes the code, the message, and the node it stands at. */
  constructor(code: string, message: string, node: Node | undefined) {
    super(message)
    this.code = code
    this.at = node?.start ?? 0
  }
}

/** The members that end a chain through `db`: each answers rows, one row, a number or nothing. */
export const endsAChain = new Set(['all', 'first', 'count', 'get', 'history', 'add', 'change', 'remove'])

/** What the arrow knows of a name of its own: a `const`, the name of a repeat, a name of an arrow. */
export function local(reach: Reach, name: string): { chain: false | 'db' | 'table' } | undefined {
  for (let i = reach.scopes.length - 1; i >= 0; i--) {
    const found = reach.scopes[i].get(name)
    if (found) return found
  }
  return undefined
}

/** Carries `work` out with one more block of names in reach. */
export function inBlock<Made>(reach: Reach, names: string[], work: () => Made): Made {
  reach.scopes.push(new Map(names.map((name) => [name, { chain: false }])))
  try {
    return work()
  } finally {
    reach.scopes.pop()
  }
}

/** A reach with nothing in it: for a value that must be written in place. */
export const nothingInReach = (): Reach => ({
  imports: new Map(),
  own: new Map(),
  tops: new Map(),
  handed: new Set(),
  scopes: [],
})
