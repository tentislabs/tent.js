// The one walk of a switch: a table walked a page at a time in the order of its ids, with its place in `_t_meta`.
import { setMeta } from './here.ts'
import { heldMeta } from './metaKeys.ts'
import type { Store, Tx } from './store.ts'

/** The key of `_t_meta` under which a file keeps where the walk of a name stands. */
const walkKey = (name: string): string => `walk.${name}`

/**
 * Takes a store or the write to work in, and the name of a walk: `<table>.<column>` for a column, the name of a
 * backfill for one. Answers where it stands in that file: the id of the last row it walked, empty at first;
 * `'done'` for a walk that runs once and ended there; or nothing where no walk of that name is noted.
 */
export function walkAt(on: Store | Tx, name: string): { after: string } | 'done' | undefined {
  const held = heldMeta(on, walkKey(name))
  if (held === 'done') return 'done'
  const after: unknown = typeof held === 'object' && held !== null ? Reflect.get(held, 'after') : undefined
  return typeof after === 'string' ? { after } : undefined
}

/** Notes, inside the write that starts it, that the walk of a name starts in this file at its first row. */
export const startWalk = (tx: Tx, name: string): void => setMeta(tx, walkKey(name), { after: '' })

/** The plan of the next page of a walk of a table: the rows after the one it reached, in the order of their ids. */
export const pagePlan = (table: string, after: string, size: number) => ({
  from: table,
  ...(after ? { where: { col: 'id', above: after } } : {}),
  sort: [{ by: 'id' }],
  limit: size,
})

/**
 * Moves the note of a walk on, inside the write of its page: to the last row the page walked, or, where the page
 * was its last, away, and to `'done'` for a walk that runs once.
 */
export function walkedOn(tx: Tx, name: string, last: string | undefined, once = false): void {
  setMeta(tx, walkKey(name), last === undefined ? (once ? 'done' : undefined) : { after: last })
}
