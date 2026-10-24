import { momentOf } from '../moment.ts'
import type { Opened } from '../opened.ts'
import { fillGroups } from './columns.ts'
import { filledTable } from './marks.ts'
import { countsAsRunning, workPrint, worksOf } from './notes.ts'
import { placesOf } from './places.ts'

const system = { kind: 'system' } as const

/** What a switch would make old of one filled column whose work changes: how many values, and `perDay` of its `by`. */
export interface MadeOld {
  table: string
  column: string
  old: number
  perDay?: Record<string, number>
}

/**
 * Takes an app and the app as the version to switch to serves it. Answers, for each filled column whose work
 * that version changes, how many of its values that count as made now would become old, with `perDay` of its
 * `by` where it states one. A column under `old: 'keep'` makes none old. It counts the shared file and the files
 * of tenants that are open, as `app.filled()` does. It reads, and changes nothing.
 */
export function madeOld(o: Opened, to: Opened): MadeOld[] {
  const found: MadeOld[] = []
  for (const group of fillGroups(to.description))
    for (const one of group.columns) {
      const works = worksOf(o.store, one)
      if (!works || one.old === 'keep' || countsAsRunning(works, workPrint(to, group, one))) continue
      let old = 0
      for (const place of placesOf(o, one.table)) {
        const rows = place.store.read(
          {
            from: filledTable,
            where: {
              all: [
                { col: 'tableName', is: one.table },
                { col: 'columnName', is: one.column },
              ],
            },
          },
          system,
        ).value
        for (const row of Array.isArray(rows) ? rows.map((it) => Object(it)) : [])
          if (momentOf(row.madeAt) !== undefined && row.state !== 'due' && countsAsRunning(works, row.work)) old += 1
      }
      const stated: unknown = Reflect.get(Object(Reflect.get(Object(one.type.by), 'limits')), 'perDay')
      const perDay = Object.fromEntries(
        Object.entries(Object(stated)).filter((entry): entry is [string, number] => typeof entry[1] === 'number'),
      )
      found.push({ table: one.table, column: one.column, old, ...(Object.keys(perDay).length ? { perDay } : {}) })
    }
  return found
}
