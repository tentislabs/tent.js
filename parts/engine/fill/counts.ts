import { momentOf } from '../moment.ts'
import type { Opened } from '../opened.ts'
import { fillGroups } from './columns.ts'
import { fillInputOf } from './inputs.ts'
import { filledTable, setFilled } from './marks.ts'
import { closedCounts } from './fileNotes.ts'
import { countsAsRunning, worksOf } from './notes.ts'
import type { Within } from './places.ts'
import { placesOf, writeAt } from './places.ts'

const system = { kind: 'system' } as const

const listOf = (found: unknown): Record<string, unknown>[] =>
  Array.isArray(found) ? found.map((one) => Object(one)) : []

/** What `app.filled()` answers of one column that work fills. */
export interface FilledCount {
  table: string
  column: string
  missing: number
  old: number
  failed: number
  oldest?: number
  lastHour: number
  limits: object | 'none'
}

/**
 * Takes an app. Answers, for each column that work fills, how many of its values are missing, old and failed, the
 * age of the oldest that is missing or old, how many were made in the last hour, and the limit of its `by`. It
 * counts the shared file and the files of tenants that are open, and the closed ones by `fills` of the directory.
 */
export function filledCounts(o: Opened): FilledCount[] {
  const now = o.clock.now()
  const found: FilledCount[] = []
  for (const group of fillGroups(o.description))
    for (const one of group.columns) {
      const works = worksOf(o.store, one)
      const count: Omit<FilledCount, 'limits'> = {
        table: one.table,
        column: one.column,
        missing: 0,
        old: 0,
        failed: 0,
        lastHour: 0,
      }
      let oldest: number | undefined
      for (const place of placesOf(o, one.table)) {
        const total = Number(place.store.read({ from: one.table, count: true }, system).value ?? 0)
        const rows = listOf(
          place.store.read(
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
          ).value,
        )
        const made = rows.filter((row) => momentOf(row.madeAt) !== undefined)
        count.missing += total - made.length
        for (const row of rows) {
          const madeAt = momentOf(row.madeAt)
          const isOld = madeAt !== undefined && (row.state === 'due' || !countsAsRunning(works, row.work))
          if (isOld) count.old += 1
          if (row.state === 'failed') count.failed += 1
          if (madeAt !== undefined && now - madeAt <= 3_600_000) count.lastHour += 1
          const at = momentOf(row.dueAt)
          if ((isOld || madeAt === undefined) && at !== undefined) oldest = Math.min(oldest ?? at, at)
        }
      }
      // The files of tenants that are closed are counted by what their row of the directory keeps.
      const closed = closedCounts(o, one.table, one.column)
      count.missing += closed.missing
      count.old += closed.old
      count.failed += closed.failed
      const by: unknown = Reflect.get(Object(one.type.by), 'limits')
      found.push({
        ...count,
        ...(oldest === undefined ? {} : { oldest: now - oldest }),
        // The limit of the `by`, or that it has none.
        limits: by && typeof by === 'object' ? by : 'none',
      })
    }
  return found
}

/**
 * `tent filled --look`: works out, for every row of each filled column, what its work would be handed, compares
 * its fingerprint with `read`, and marks each row that differs, a row written in raw SQL among them. Answers how
 * many were marked. Of a tenant table it looks in the files that `within` names (`--of`, `--all`).
 */
export function lookAgain(o: Opened, within: Within = {}): number {
  let marked = 0
  for (const group of fillGroups(o.description))
    for (const place of placesOf(o, group.table, within))
      writeAt(o, place, (tx) => {
        for (const row of listOf(tx.read({ from: group.table }, system))) {
          const id = String(row.id)
          const { read } = fillInputOf(o, tx, group, row)
          for (const one of group.columns) {
            const [held] = listOf(
              tx.read(
                {
                  from: filledTable,
                  where: {
                    all: [
                      { col: 'tableName', is: group.table },
                      { col: 'rowId', is: id },
                      { col: 'columnName', is: one.column },
                    ],
                  },
                  limit: 1,
                },
                system,
              ),
            )
            // A value that is due is made anyway, and one whose work was handed this very input stands as it is.
            if (held && (held.state === 'due' || held.read === read)) continue
            setFilled(tx, group.table, id, one.column, {
              state: 'due',
              dueAt: new Date(o.clock.now()),
              tries: 0,
              error: null,
            })
            marked += 1
          }
        }
      })
  o.filling?.poke()
  return marked
}

/**
 * `tent filled --failed <table>.<column>`: the values that failed for good, with what a caller would see of their
 * errors. Of a tenant table, in the files that `within` names (`--of`, `--all`).
 */
export function failedOf(o: Opened, named: string, within: Within = {}): { id: string; error: unknown }[] {
  const [table, column] = named.split('.')
  if (!table || !column) return []
  return placesOf(o, table, within).flatMap((place) =>
    listOf(
      place.store.read(
        {
          from: filledTable,
          where: {
            all: [
              { col: 'tableName', is: table },
              { col: 'columnName', is: column },
              { col: 'state', is: 'failed' },
            ],
          },
        },
        system,
      ).value,
    ).map((row) => ({ id: String(row.rowId), error: row.error })),
  )
}
