import { pagePlan, startWalk, walkAt, walkedOn } from '../../data/index.ts'
import { storedLimit } from '../limits.ts'
import type { Opened } from '../opened.ts'
import type { FillGroup } from './columns.ts'
import { readsOf } from './columns.ts'
import { filledRow, filledTable, setFilled } from './marks.ts'
import type { Works } from './notes.ts'
import { setNote, walkName, workPrint, worksKey, worksOf } from './notes.ts'
import type { FillPlace } from './places.ts'
import { placesOf, writeAt } from './places.ts'

const system = { kind: 'system' } as const

const listOf = (found: unknown): Record<string, unknown>[] =>
  Array.isArray(found) ? found.map((one) => Object(one)) : []

/**
 * Takes an app and its fill groups. Writes, in the shared file, what each filled column rests on, where that
 * changed: a column it sees for the first time is walked for the rows that were there before; a work that changed
 * makes the values old, but under `old: 'keep'`, which holds the new one the same, and `old: 'drop'` empties them.
 */
export function switched(o: Opened, groups: FillGroup[]): void {
  const now = o.clock.now()
  for (const group of groups)
    for (const one of group.columns) {
      const running = workPrint(o, group, one)
      const works = worksOf(o.store, one)
      if (works?.running === running) continue
      const next: Works = !works
        ? { running, base: running, also: [], at: now }
        : one.old === 'keep'
          ? { running, base: works.base, also: [...works.also, running], at: works.at }
          : { running, base: running, also: [], at: now }
      o.store.write((tx) => {
        setNote(tx, worksKey(one), next)
        if (!works) startWalk(tx, walkName(one))
      })
      if (works && one.old === 'drop') dropOld(o, group, one.column, next)
    }
}

/**
 * Takes an app, a fill group, one of its columns, the works that count, and the files to look in, the open ones of
 * its table where none are named. Empties each value of the column that a work made which counts no more, and
 * marks it due.
 */
export function dropOld(
  o: Opened,
  group: FillGroup,
  column: string,
  works: Works,
  places: FillPlace[] = placesOf(o, group.table),
): void {
  for (const place of places)
    writeAt(o, place, (tx) => {
      const rows = listOf(
        tx.read(
          {
            from: filledTable,
            where: {
              all: [
                { col: 'tableName', is: group.table },
                { col: 'columnName', is: column },
              ],
            },
          },
          system,
        ),
      )
      for (const one of rows) {
        if (one.work === works.base || works.also.includes(String(one.work))) continue
        const id = String(one.rowId)
        tx.change(group.table, id, { [column]: null }, system)
        tx.remove(filledTable, { tableName: group.table, rowId: id, columnName: column }, system)
        setFilled(tx, group.table, id, column, { state: 'due', dueAt: new Date(o.clock.now()) })
      }
    })
}

/**
 * Walks, a page at a time, by the one walk of a switch, the rows of each filled column whose walk the shared file
 * notes: a row that has no row in `_t_filled` for it is marked due at once. The note moves on with each page, and
 * goes at the end, so a writer that stops in the middle goes on from there.
 */
export function walk(o: Opened, groups: FillGroup[]): boolean {
  const size = storedLimit(o.description, 'workPage') || 1000
  let walked = false
  for (const group of groups)
    for (const one of group.columns) {
      const note = walkAt(o.store, walkName(one))
      if (note === undefined || note === 'done') continue
      walked = true
      const { after } = note
      let last = after
      let count = 0
      for (const place of placesOf(o, group.table))
        writeAt(o, place, (tx) => {
          const rows = listOf(tx.read(pagePlan(group.table, after, size), system))
          count = Math.max(count, rows.length)
          for (const row of rows) {
            const id = String(row.id)
            if (id > last) last = id
            if (!filledRow(tx, group.table, id, one.column))
              setFilled(tx, group.table, id, one.column, { state: 'due', dueAt: new Date(o.clock.now()) })
          }
        })
      o.store.write((tx) => walkedOn(tx, walkName(one), count < size ? undefined : last))
    }
  return walked
}

/**
 * Walks the rows that read a row through a link, where a write marked that row under `*`: each such row is marked
 * due, `limits.workPage` in a write, and the `*` mark goes only where it still holds what the walk began with, so a
 * second change during the marking is not missed.
 */
export function followLinks(o: Opened, groups: FillGroup[]): boolean {
  const size = storedLimit(o.description, 'workPage') || 1000
  let followed = false
  const tables = new Set(groups.map((group) => group.table))
  for (const table of tables)
    for (const place of placesOf(o, table)) {
      const stars = listOf(place.store.read({ from: filledTable, where: { col: 'columnName', is: '*' } }, system).value)
      for (const star of stars) {
        followed = true
        const [from, id, token] = [String(star.tableName), String(star.rowId), String(star.read)]
        for (const group of groups)
          for (const [link] of readsOf(group).linked) {
            const type: unknown = Reflect.get(Object(o.description.tables[group.table]?.columns), link)
            if (Reflect.get(Object(type), 'table') !== from) continue
            let after = ''
            for (;;) {
              const rows = listOf(
                place.store.read(
                  {
                    from: group.table,
                    where: {
                      all: [{ col: link, is: id }, ...(after ? [{ col: 'id', above: after }] : [])],
                    },
                    sort: [{ by: 'id' }],
                    limit: size,
                  },
                  system,
                ).value,
              )
              if (!rows.length) break
              writeAt(o, place, (tx) => {
                for (const row of rows)
                  for (const one of group.columns)
                    setFilled(tx, group.table, String(row.id), one.column, {
                      state: 'due',
                      dueAt: new Date(o.clock.now() + group.debounce),
                      tries: 0,
                      error: null,
                    })
              })
              after = String(rows.at(-1)?.id ?? '')
              if (rows.length < size) break
            }
          }
        writeAt(o, place, (tx) => {
          if (filledRow(tx, from, id, '*')?.read === token)
            tx.remove(filledTable, { tableName: from, rowId: id, columnName: '*' }, system)
        })
      }
    }
  return followed
}
