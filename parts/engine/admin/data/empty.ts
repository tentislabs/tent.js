import type { Admin } from '../../admin.ts'

const system = { kind: 'system' } as const

/**
 * What a seed asks of the data before it is applied: whether it holds no row of the app. Tables that were made
 * and hold nothing are empty data. No command types it: `tent start --seed` asks it of the app it opened.
 */
export const admin: Admin = {
  name: 'data empty',
  run: async (o) => {
    // A row in the file of a tenant hangs on the row of its tenant, which lies in the shared file: where that
    // file holds no row, no file of a tenant holds one that the app still reads.
    // A table that shows what the engine keeps holds no row of the app, and has no table of its own in the store.
    const shared = Object.entries(o.description.tables).filter(
      ([, table]) => table.tenant === undefined && table.shows === undefined,
    )
    return shared.every(([name]) => {
      const rows = o.store.read({ from: name, limit: 1 }, system).value
      return !Array.isArray(rows) || rows.length === 0
    })
  },
}
