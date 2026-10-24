import { TentError } from './errors.ts'
import { runtime } from './runtime.ts'

/** The kinds of definition. */
export type Kind =
  | 'query'
  | 'change'
  | 'action'
  | 'flow'
  | 'agent'
  | 'table'
  | 'service'
  | 'model'
  | 'project'
  | 'screen'
  | 'component'
  | 'route'
  | 'incoming'
  | 'command'
  | 'backfill'

/** A value that stands for a definition, or for a member of one, wherever one is handed on: it is read by its name. */
export interface Marker<Name extends string = string> {
  readonly definition: Name
}

/** What a word returns: the name, the kind, and the options as they were written. */
export interface Definition<K extends Kind = Kind, Name extends string = string, Options = object>
  extends Marker<Name> {
  readonly kind: K
  readonly options: Options
}

const helperWords = new WeakMap<object, string>()

/** Takes a definition and the helper word that made it, and keeps the word, since a `python` is of the kind `action`. */
export function madeBy<Made extends object>(definition: Made, word: string): Made {
  helperWords.set(definition, word)
  return definition
}

/** Answers the helper word that made a definition, or nothing for one that a word of its own kind made. */
export const helperWordOf = (definition: object): string | undefined => helperWords.get(definition)

/**
 * Takes the name of a definition, or of a member of one. Answers a marker that is called as a function: reading it
 * does no work, and a call is handed on to the runtime under that name, with all its arguments in order. A call
 * throws T0010 where the slot is empty.
 */
export function calls(name: string): ((...args: unknown[]) => unknown) & Marker {
  return Object.assign((...args: unknown[]) => runtime(name).call(name, args), { definition: name })
}

/**
 * Takes a kind, and the name and the options that a word was handed. Throws T1014 where the name is no text or the
 * options are no record: a word does no work, and what it is handed in those two places is all it reads.
 */
function heldTo(kind: Kind, name: unknown, options: unknown): void {
  if (typeof name !== 'string' || typeof options !== 'object' || options === null || Array.isArray(options))
    throw new TentError(
      'T1014',
      `A word that makes ${kind === 'action' || kind === 'agent' || kind === 'incoming' ? 'an' : 'a'} ${kind} takes a name as text and its options as a record.`,
      {
        fix: "Write the word as <word>('name', { ... }).",
      },
    )
}

/** Takes a kind, a name and the options. Answers the record of a definition that nothing calls. */
export function record(kind: Kind, name: string, options: object): Definition {
  heldTo(kind, name, options)
  return { definition: name, kind, options }
}

/**
 * Takes a kind, a name and the options. Answers a definition that is called as a function: a call is handed on to
 * the runtime under the name.
 */
export function callable(kind: Kind, name: string, options: object): ((...args: unknown[]) => unknown) & Definition {
  heldTo(kind, name, options)
  return Object.assign(calls(name), { kind, options })
}
