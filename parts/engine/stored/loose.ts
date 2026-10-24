import type { Row } from '../../data/index.ts'
import { storedLimit } from '../limits.ts'
import { momentOf } from '../moment.ts'
import type { Opened } from '../opened.ts'
import { table } from '../tables/files.ts'
import { fileRow, forgetFile } from './files.ts'

const system = { kind: 'system' } as const

/**
 * Removes the loose files whose time is up: a file that no row has held for `limits.looseKept` is marked as
 * removed, and can then be neither downloaded nor stored. Its row and its bytes stay for `limits.filesKept`, so
 * that a restore of the data finds the files its rows hold, and are taken away for good after that. A reader
 * removes none: its writer does.
 */
export async function sweepLoose(o: Opened): Promise<void> {
  if (o.machine.reader) return
  const now = o.clock.now()
  const [looseKept, filesKept] = [storedLimit(o.description, 'looseKept'), storedLimit(o.description, 'filesKept')]
  const rows = o.store.read({ from: table.name }, system).value
  const all: Row[] = Array.isArray(rows) ? rows : []
  const over = all.filter(
    (row) => row.removedAt === undefined && (momentOf(row.looseAt) ?? Number.POSITIVE_INFINITY) + looseKept <= now,
  )
  if (over.length)
    o.store.write((tx) => {
      for (const row of over) tx.change(table.name, String(row.id), { removedAt: new Date(now) }, system)
    })
  for (const row of all) {
    if ((momentOf(row.removedAt) ?? Number.POSITIVE_INFINITY) + filesKept > now) continue
    const file = fileRow(o, String(row.id))
    if (file) await forgetFile(o, file)
  }
}
