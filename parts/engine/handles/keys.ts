import type { Tx } from '../../data/index.ts'
import { callOf } from '../handleCall.ts'
import { addKey, keysOf, removeKey } from '../keys/kept.ts'
import type { Shown } from '../keys/made.ts'
import { madeKey, shownOf } from '../keys/made.ts'
import type { Opened } from '../opened.ts'
import { isStored } from '../../core/internal.ts'

/** The handle is full access, and its writes write. */
const acts = { acts: true, full: 'makes and removes the keys of programs' }

/** Carries a write out in the write of the call that is open, or in one of its own. */
function written(o: Opened, tx: Tx | undefined, work: (tx: Tx) => void): void {
  if (tx) work(tx)
  else o.store.write((open) => work(open))
}

/**
 * The working object behind the handle `keys`: the keys of programs. It is full access, so a function that uses
 * it states `system` and carries the rule itself. Each member answers at once.
 */
export const handle = (o: Opened): object => ({
  add(given: unknown): { id: string; key: string } {
    const cx = callOf('`keys.add`', acts)
    const made = madeKey(o, given)
    written(o, cx.writing ? cx.writing.tx() : cx.tx, (tx) => addKey(tx, made.row, made.fingerprint))
    return { id: made.row.id, key: made.key }
  },
  list(given?: unknown): Shown[] {
    const cx = callOf('`keys.list`', { full: 'reads the keys of programs' })
    const user: unknown = isStored(given) ? given.user : undefined
    return keysOf(o, typeof user === 'string' ? user : undefined, cx.writing ? cx.writing.tx() : cx.tx).map(shownOf)
  },
  remove(id: unknown): void {
    const cx = callOf('`keys.remove`', acts)
    written(o, cx.writing ? cx.writing.tx() : cx.tx, (tx) => removeKey(tx, String(id)))
  },
})
