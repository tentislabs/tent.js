import type { StorePlan } from '../data/index.ts'
import type { Opened } from './opened.ts'

const system = { kind: 'system' } as const

/** The tables of an app that are kept in memory and state how long a row lasts, with that length in milliseconds. */
function lasting(o: Opened): { table: string; lasts: number }[] {
  return Object.entries(o.description.tables).flatMap(([table, record]) =>
    record.kept === 'memory' && typeof record.lasts === 'number' ? [{ table, lasts: record.lasts }] : [],
  )
}

/**
 * Takes what the engine holds of an app, on its writer. Takes away, by the clock of the app, each row of a table
 * kept in memory once its `lasts` has passed since its last write, in a write of the store that tells the live
 * pages; a read never answers such a row meanwhile. Answers what stops it, or nothing where no table lasts.
 */
export function keepFresh(o: Opened): { close(): void } | undefined {
  const tables = lasting(o)
  if (!tables.length) return undefined
  // A quarter of the shortest length, so a row is taken away soon after its time.
  const every = Math.max(250, Math.min(...tables.map((one) => one.lasts)) / 4)
  let cancel = (): void => undefined
  const sweep = (): void => {
    if (o.closed) return
    const now = o.clock.now()
    const oldOf = (read: (plan: StorePlan) => unknown, table: string, lasts: number): string[] => {
      const rows = read({ from: table, where: { col: 'updatedAt', before: new Date(now - lasts) }, pick: ['id'] })
      return (Array.isArray(rows) ? rows : []).map((row) => String(Object(row).id))
    }
    // A write is made only where an old row is there, which is read again inside it.
    const any = tables.some(
      ({ table, lasts }) => oldOf((plan) => o.store.read(plan, system).value, table, lasts).length,
    )
    if (any)
      o.store.write((tx) => {
        for (const { table, lasts } of tables)
          for (const id of oldOf((plan) => tx.read(plan, system), table, lasts)) tx.remove(table, id, system)
      })
    cancel = o.clock.setTimer(o.clock.now() + every, sweep)
  }
  cancel = o.clock.setTimer(o.clock.now() + every, sweep)
  return { close: () => cancel() }
}
