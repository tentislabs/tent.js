import { TentError } from '../core/index.ts'
import type { Row } from './store.ts'

/**
 * What a `db` handed out, by what it is: a row with the private columns of its table, a record of a group with
 * the fields that were worked out from a private column, an entry of a history, a page, and the list of any of them.
 */
type Handed =
  | { kind: 'row'; private: readonly string[] }
  | { kind: 'group'; private: readonly string[] }
  | { kind: 'entry' }
  | { kind: 'page' }
  | { kind: 'list' }

/** What `Mark` is built on. Made through `Same`, it is the object it was handed, so the members of `Mark` are added to that object. */
class Handed0 {
  constructor(_value: object) {}
}
const Same = new Proxy(Handed0, {
  construct(_base, values: unknown[]): object {
    const [value] = values
    return typeof value === 'object' && value !== null ? value : {}
  },
})

/**
 * Keeps what an object is in a private member of the object itself. The object stays the plain record that code is
 * handed: no list of its members shows the mark, and no copy carries it. A map beside the objects would hold every
 * row of every read until the runtime next looks through it, which lies on the path of every read of a query.
 */
class Mark extends Same {
  #what: Handed
  constructor(value: object, what: Handed) {
    super(value)
    this.#what = what
  }
  /** Answers what a value is kept as, or nothing for a value that no db handed out. */
  static of(value: unknown): Handed | undefined {
    return typeof value === 'object' && value !== null && #what in value ? value.#what : undefined
  }
}

/** Answers what a value is kept as, where a `db` handed it out: what a room that crosses carries with its copy. */
export const keptAs = Mark.of

/** Freezes what a column holds through and through: every list and every object inside it. */
export function frozen(value: unknown): void {
  // A moment is no list and no object of a column: freezing one would keep nothing of it from being set.
  if (typeof value !== 'object' || value === null || value instanceof Date || Object.isFrozen(value)) return
  Object.freeze(value)
  for (const inner of Array.isArray(value) ? value : Object.values(value)) frozen(inner)
}

/**
 * Keeps what an object is, and freezes it. Answers the object. What stands inside it is frozen by whoever hands it
 * out, who knows which of its members can hold a list or an object: walking every member of every row would lie on
 * the path of every read of a query.
 */
export function hand<Value extends object>(value: Value, what: Handed): Value {
  new Mark(value, what)
  return Object.freeze(value)
}

/**
 * Takes a copy of an object that a `db` handed out, and what it was kept as, as a room that crosses carries them.
 * Keeps it as that again, and freezes it. Answers the object, as it is where what it carried is no such record.
 */
export function handAgain(value: object, what: unknown): object {
  const kind: unknown = Reflect.get(Object(what), 'kind')
  const hidden: unknown = Reflect.get(Object(what), 'private')
  const names = Array.isArray(hidden) ? hidden.map(String) : []
  if (kind === 'row' || kind === 'group') return hand(value, { kind, private: names })
  if (kind === 'entry' || kind === 'page' || kind === 'list') return hand(value, { kind })
  return value
}

const refused = (what: string): TentError =>
  new TentError('T0009', `A query answered ${what}, which is no row that db handed out.`, {
    fix: 'Answer the rows as db handed them, or state `output` for another shape.',
  })

/** One handed object as it leaves: a copy without what is private, marked as handed again. */
function leaving(value: unknown): unknown {
  const what = keptAs(value)
  if (!what || typeof value !== 'object' || value === null) throw refused('a value of another kind')
  if (what.kind === 'list' && Array.isArray(value)) return hand(value.map(leaving), what)
  const made: Row = {}
  for (const [name, inner] of Object.entries(value)) {
    if ((what.kind === 'row' || what.kind === 'group') && what.private.includes(name)) continue
    // A linked row inside a row, the row inside an entry of a history, and the rows of a page leave the same way.
    made[name] = keptAs(inner) ? leaving(inner) : inner
  }
  return hand(made, what)
}

/**
 * Takes what a query written with `run` answered where it states no `output`. Answers the value, with the private
 * columns of each row's table removed, when it is nothing, a number, one object that a `db` handed out, or a list
 * whose every entry is one. What it answers is marked as handed again. Throws T0009 for anything else: a copy of a
 * row, a record that code built, a row inside one, and a list with an empty place in it.
 */
export function handedAnswer(value: unknown): unknown {
  if (value === undefined || typeof value === 'number') return value
  if (!Array.isArray(value) || keptAs(value)) return leaving(value)
  const left: unknown[] = []
  for (let at = 0; at < value.length; at++) {
    if (!(at in value) || value[at] === undefined) throw refused('a list with an empty place in it')
    left.push(leaving(value[at]))
  }
  return hand(left, { kind: 'list' })
}
