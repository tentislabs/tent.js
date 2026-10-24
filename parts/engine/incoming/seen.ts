import type { Tx } from '../../data/index.ts'
import { storedLimit } from '../limits.ts'
import type { Opened } from '../opened.ts'
import { table } from '../tables/once.ts'

const system = { kind: 'system' } as const

/**
 * Takes the write that is open, an app, the name an id is noted under, and the id. Notes it, inside the write.
 * Answers whether it was noted before: a repeat, which starts nothing.
 */
export function seenBefore(tx: Tx, o: Opened, under: string, id: string): boolean {
  const key = { caller: `incoming:${under}`, key: id }
  const held: unknown = tx.read({ from: table.name, one: 'get', id: key }, system)
  if (held !== undefined && held !== null) return true
  tx.add(table.name, { ...key, run: '', at: new Date(o.clock.now()) }, system)
  return false
}

/** Removes the ids that were noted longer ago than `limits.incomingKept`, on the machine that writes. */
export function sweepSeen(o: Opened): void {
  const before = new Date(o.clock.now() - storedLimit(o.description, 'incomingKept'))
  const coming = { col: 'caller', startsWith: 'incoming:' }
  const read = o.store.read({ from: table.name, where: { all: [coming, { col: 'at', below: before }] } }, system).value
  const old = Array.isArray(read) ? read : []
  if (old.length)
    o.store.write((tx) => {
      for (const row of old) tx.remove(table.name, { caller: String(row.caller), key: String(row.key) }, system)
    })
}
