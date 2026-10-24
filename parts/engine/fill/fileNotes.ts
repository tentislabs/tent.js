import type { FileName, Store, Tx } from '../../data/index.ts'
import { directoryTable as directory } from '../files/directory.ts'
import { storedLimit } from '../limits.ts'
import { momentOf } from '../moment.ts'
import type { Opened } from '../opened.ts'
import { fingerprintOfText } from '../remember/keyOf.ts'
import { fillAtOf } from './closedFiles.ts'
import type { FillGroup } from './columns.ts'
import { fillGroups } from './columns.ts'
import { filledRow, filledTable, setFilled } from './marks.ts'
import { countsAsRunning, workPrint, worksOf } from './notes.ts'
import { dropOld } from './walking.ts'

const system = { kind: 'system' } as const

const listOf = (found: unknown): Record<string, unknown>[] =>
  Array.isArray(found) ? found.map((one) => Object(one)) : []

/** The counts of the values of one filled column of a file, as `fills` of its row in the directory keeps them. */
export interface FillCount {
  missing: number
  old: number
  failed: number
}

/** What the directory keeps of a file that closes, for the columns that work fills. */
interface FillNotes {
  fillAt?: number
  fills?: Record<string, FillCount>
  fillsOf?: string
}

/** The fill groups of the tenant tables: their values stand in the files of tenants. */
const tenantGroups = (o: Opened): FillGroup[] =>
  fillGroups(o.description).filter((group) => o.description.tables[group.table]?.tenant !== undefined)

/**
 * The fingerprint of what the values of the files of tenants rest on now: the `base` of every filled column of a
 * tenant table, or its running work where it has none. Nothing where no such column is.
 */
function fillsPrintOf(o: Opened): string | undefined {
  const parts: string[] = []
  for (const group of tenantGroups(o))
    for (const one of group.columns)
      parts.push(`${one.table}.${one.column}:${worksOf(o.store, one)?.base ?? workPrint(o, group, one)}`)
  return parts.length ? fingerprintOfText(parts.sort().join('\n')) : undefined
}

/**
 * Takes an app and the store of a tenant's file that closes. Answers what its row of the directory keeps: the
 * earliest moment a value is due, the counts of the values of each filled column by `<table>.<column>`, and the
 * fingerprint of what they rest on, where every row of the file is walked and no value is old. A value that is
 * only due is no reason to open the file again: its `fillAt` brings the pass to it.
 */
export function fillNotesOf(o: Opened, store: Store): FillNotes {
  const fillAt = fillAtOf(store)
  const held = new Set(store.layout().map((one) => one.name))
  if (!held.has(filledTable)) return fillAt === undefined ? {} : { fillAt }
  const fills: Record<string, FillCount> = {}
  let whole = true
  for (const group of tenantGroups(o)) {
    if (!held.has(group.table)) continue
    const total = Number(store.read({ from: group.table, count: true }, system).value ?? 0)
    for (const one of group.columns) {
      const works = worksOf(o.store, one)
      const rows = listOf(
        store.read(
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
      const count: FillCount = { missing: 0, old: 0, failed: 0 }
      for (const row of rows) {
        const made = momentOf(row.madeAt) !== undefined
        if (made && (row.state === 'due' || !countsAsRunning(works, row.work))) count.old += 1
        if (row.state === 'failed') count.failed += 1
      }
      count.missing = total - rows.filter((row) => momentOf(row.madeAt) !== undefined).length
      if (rows.length < total || count.old > 0) whole = false
      fills[`${one.table}.${one.column}`] = count
    }
  }
  const print = whole ? fillsPrintOf(o) : undefined
  return { ...(fillAt === undefined ? {} : { fillAt }), fills, ...(print === undefined ? {} : { fillsOf: print }) }
}

/** Writes what a file that closes keeps for its filled columns into its row of the directory. `fillsOf` stays where it is not given. */
export function setFillNotes(tx: Tx, file: FileName, notes: FillNotes | undefined): void {
  const key = { tableName: file.table, rowId: file.id }
  if (tx.read({ from: directory.name, one: 'get', id: key }, system) === undefined) return
  tx.change(
    directory.name,
    key,
    {
      fillAt: notes?.fillAt === undefined ? null : new Date(notes.fillAt),
      ...(notes?.fills ? { fills: notes.fills } : {}),
      ...(notes?.fillsOf ? { fillsOf: notes.fillsOf } : {}),
    },
    system,
  )
}

/** The counts of the values of one filled column that the closed files of tenants keep, summed. */
export function closedCounts(o: Opened, table: string, column: string): FillCount {
  const sum: FillCount = { missing: 0, old: 0, failed: 0 }
  if (!o.files || o.description.tables[table]?.tenant === undefined) return sum
  for (const row of listOf(o.store.read({ from: directory.name, where: { col: 'open', is: 0 } }, system).value)) {
    const kept: Record<string, unknown> = Object(Object(row.fills)[`${table}.${column}`])
    for (const name of ['missing', 'old', 'failed'] as const)
      if (typeof kept[name] === 'number') sum[name] += Number(kept[name])
  }
  return sum
}

/** Marks due each row of a file that has no value of a filled column yet: a file that was closed when its column gained `by`. */
function walkFile(o: Opened, file: FileName, store: Store): void {
  const size = storedLimit(o.description, 'workPage') || 1000
  for (const group of tenantGroups(o)) {
    if (!store.layout().some((one) => one.name === group.table)) continue
    let after = ''
    for (;;) {
      const rows = listOf(
        store.read(
          {
            from: group.table,
            ...(after ? { where: { col: 'id', above: after } } : {}),
            sort: [{ by: 'id' }],
            limit: size,
          },
          system,
        ).value,
      )
      if (!rows.length) break
      o.files?.write((w) => {
        const tx = w.tx(file)
        for (const row of rows)
          for (const one of group.columns)
            if (!filledRow(tx, group.table, String(row.id), one.column))
              setFilled(tx, group.table, String(row.id), one.column, { state: 'due', dueAt: new Date(o.clock.now()) })
      })
      after = String(rows.at(-1)?.id ?? '')
      if (rows.length < size) break
    }
  }
}

// The files that the pass opened because what their values rest on changed, for each app: `waits` while one is
// brought up to the running layout first, which opens it.
const opened = new WeakMap<Opened, Map<string, { file: FileName; waits: boolean }>>()

/**
 * Opens the closed files of tenants whose `fillsOf` is not the fingerprint that holds now, `limits.filesAtOnce` at
 * a time, marks each row in them that has no value yet, and empties the values of a column under `old: 'drop'`
 * that a work which counts no more made: the pass then makes what is old or missing there. A file that is behind
 * the running layout, or that a pass brings up now, is opened once it is brought up, and `again` is called then.
 * Answers whether it opened one.
 */
export function openBehind(o: Opened, again: () => void): boolean {
  const { files, tenantFiles } = o
  if (!files) return false
  const print = fillsPrintOf(o)
  if (print === undefined) return false
  const held = opened.get(o) ?? new Map<string, { file: FileName; waits: boolean }>()
  opened.set(o, held)
  const open = new Set(
    files.open().map(
      (one) => `${one.table}
${one.id}`,
    ),
  )
  for (const [key, one] of [...held]) if (!one.waits && !open.has(key)) held.delete(key)
  let any = false
  for (const [key, one] of held)
    if (one.waits && open.has(key)) {
      const store = files.of(one.file)
      held.set(key, { file: one.file, waits: false })
      if (store) newlyOpened(o, one.file, store)
      any = true
    }
  let room = Math.max(1, storedLimit(o.description, 'filesAtOnce')) - held.size
  for (const row of listOf(o.store.read({ from: directory.name }, system).value)) {
    if (room <= 0) break
    const file = { table: String(row.tableName), id: String(row.rowId) }
    const key = `${file.table}
${file.id}`
    // A file that is open is the pass's own already, and one that failed waits for its retry.
    if (row.fillsOf === print || open.has(key) || held.has(key) || row.failed) continue
    room -= 1
    const store = row.open ? undefined : files.of(file)
    if (store) {
      held.set(key, { file, waits: false })
      newlyOpened(o, file, store)
      any = true
      continue
    }
    if (!tenantFiles) continue
    held.set(key, { file, waits: true })
    void tenantFiles.ready(file).then(again, () => held.delete(key))
  }
  return any
}

/** Readies a file that the pass opened for its values: the rows with none are marked, and the old ones of `drop` emptied. */
function newlyOpened(o: Opened, file: FileName, store: Store): void {
  walkFile(o, file, store)
  for (const group of tenantGroups(o))
    for (const one of group.columns) {
      const works = worksOf(o.store, one)
      if (one.old === 'drop' && works && store.layout().some((it) => it.name === group.table))
        dropOld(o, group, one.column, works, [{ store, file }])
    }
}
