import { mark } from '../core/internal.ts'
import type { AnswerOf, InputOf, Stub } from './travelled.ts'

/** How an entry of `data` is asked: whether the screen is not found without it, whether the page waits, and how often it is asked again. */
export interface ReadOptions {
  needed?: boolean
  wait?: boolean
  refresh?: string
}

/** An entry of `data`: what it reads, by its name, with its input. `Answer` is what the view is handed under its name. */
export interface Read<Answer = unknown> {
  readonly read: string
  readonly input?: object
  readonly needed?: boolean
  readonly wait?: boolean
  readonly refresh?: string
  // Carried by the type alone: the answer of what is read, as the view is handed it.
  readonly answer?: Answer
}

// Kept beside the record and not on it, so that an entry is the plain data that the description stores.
const kinds = new WeakMap<object, string>()

/** The kind of what an entry reads, `'query'` or `'action'`, where `read` made the entry in this program. */
export const kindRead = (entry: object): string | undefined => kinds.get(entry)

/**
 * Takes a query or an action as a screen file imported it, its input, and how it is asked. Answers the record of
 * an entry of `data`, which only names what is read: the page asks it through the door. An entry that states
 * `wait: false` may be nothing in its view, and one that states `needed: true` never is: where it answers nothing,
 * its screen is not found.
 */
export function read<const What extends Stub, const O extends ReadOptions = Record<never, never>>(
  what: What,
  input?: InputOf<What>,
  o?: O,
): Read<
  O extends { wait: false }
    ? AnswerOf<What> | undefined
    : O extends { needed: true }
      ? NonNullable<AnswerOf<What>>
      : AnswerOf<What>
>
export function read(what: Stub, input?: unknown, o: ReadOptions = {}): Read {
  const entry = mark({ read: what.definition, ...(typeof input === 'object' && input !== null ? { input } : {}), ...o })
  reads.set(entry, what)
  kinds.set(entry, what.kind)
  return entry
}

// What each entry reads, as the screen file imported it: the record of an entry names it alone.
const reads = new WeakMap<object, Stub>()

/** Answers what an entry of `data` reads, as its screen file imported it, or nothing for a record that `read` did not make. */
export const readBy = (entry: object): Stub | undefined => reads.get(entry)
