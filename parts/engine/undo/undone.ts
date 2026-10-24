import { TentError } from '../../core/index.ts'
import type { By, FileName, Row, SinkChange, Store, Wrote } from '../../data/index.ts'
import { putBack } from '../../data/index.ts'
import type { PutBack } from '../archived/archive.ts'
import { archiveOf } from '../archived/archive.ts'
import { byWhom } from '../byWhom.ts'
import type { CallContext } from '../context.ts'
import type { Opened } from '../opened.ts'
import { systemWrite } from '../systemWrite.ts'

const system = { kind: 'system' } as const

/** A row that an undo leaves as it stands, and why: what the work left in its columns, and what stands there now. */
interface Clash {
  table: string
  id: string
  columns: string[]
  left?: Row
  now?: Row
  // A change that names no one: it may have been the work that is undone, and is not taken back.
  by?: 'unknown'
}

/** What an undo answers: how many rows it took back, what it left, and what stays done outside the app. */
export interface Undone {
  undone: number
  clashes: Clash[]
  outside: { kind: string; name: string; at: number }[]
}

/** What the work did to one row, over all its writes: the row before its first write, whether its last removed it, and what it set. */
interface Net {
  table: string
  id: string
  first?: Row
  gone: boolean
  columns: Set<string>
  // The numbers of the work's first and last write of the row, and the moment of its first.
  since: number
  to: number
  sinceAt: number
  // The place of its last write among the writes of the work, by which it is taken back in reverse.
  seq: number
  // A change of the row whose values before are not known: it cannot be put back.
  blind: boolean
  // The file of the tenant the row lives in, for a tenant table.
  file?: FileName
}

/** A write of a row by someone other than the work: its number, and what the row held before it, where that is known. */
interface Since {
  n: number
  before?: Row
}

// The columns every row of a table of the app holds, which a write sets by itself.
const moments = ['id', 'createdAt', 'updatedAt']

const isRow = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value)

/** A row's values in some columns, as the wire carries them: a moment as its text. */
const shown = (row: Row | undefined, columns: string[]): Row | undefined =>
  row
    ? Object.fromEntries(
        columns.map((column) => {
          const value = row[column]
          return [column, value instanceof Date ? value.toISOString() : (value ?? null)]
        }),
      )
    : undefined

/** The columns of a table that the engine works out, which no write sets: a kept count, and a column of another's. */
function workedOut(o: Opened, table: string): Set<string> {
  const columns: Record<string, unknown> = Object(Reflect.get(Object(o.description.tables[table]), 'columns'))
  return new Set(
    Object.entries(columns)
      .filter(
        ([, type]) =>
          Reflect.get(Object(type), 'keeps') !== undefined || Reflect.get(Object(type), 'from') !== undefined,
      )
      .map(([name]) => name),
  )
}

/** The columns a write of a row set, but for those every write sets and those the engine works out. */
function setBy(o: Opened, wrote: Wrote): string[] {
  const worked = workedOut(o, wrote.table)
  const set = wrote.kind === 'changed' ? (wrote.columns ?? Object.keys(wrote.before ?? {})) : Object.keys(wrote.row)
  return set.filter((one) => !moments.includes(one) && !worked.has(one))
}

/** The store of the file a row lives in: of its tenant, or the shared one. */
const storeOf = (o: Opened, file: FileName | undefined): Store | undefined => (file ? o.files?.of(file) : o.store)

const fileKey = (file: FileName | undefined): string => (file ? `${file.table} ${file.id}` : '')

/** Whether a row of another table links to a row now, but for the rows the same undo removes. */
function linkedTo(o: Opened, net: Net, removed: Set<string>): boolean {
  const { table, id } = net
  for (const [name, stated] of Object.entries(o.description.tables)) {
    const columns: Record<string, unknown> = Object(stated.columns)
    for (const [column, type] of Object.entries(columns)) {
      if (Reflect.get(Object(type), 'kind') !== 'link' || Reflect.get(Object(type), 'table') !== table) continue
      // A tenant table is read in the file of the row, where its links stand.
      const at = stated.tenant === undefined ? o.store : storeOf(o, net.file)
      const found = at?.read({ from: name, where: { col: column, is: id }, pick: ['id'] }, system).value
      for (const row of Array.isArray(found) ? found : []) if (!removed.has(`${name}\n${String(row.id)}`)) return true
    }
  }
  return false
}

/** The row of a table that stands now, in its file, or nothing. */
function standing(o: Opened, net: Net): Row | undefined {
  const row: unknown = storeOf(o, net.file)?.read({ from: net.table, one: 'get', id: net.id }, system).value
  return isRow(row) ? row : undefined
}

/** Whether a change is of the rows of the app: a table of the engine's own is never taken back. */
const ofTheApp = (o: Opened, table: string): boolean =>
  !table.startsWith('_t_') && Object.hasOwn(o.description.tables, table)

/** What the work did to each row, from its changes in order. */
function netsOf(o: Opened, changes: SinkChange[]): Map<string, Net> {
  const nets = new Map<string, Net>()
  let seq = 0
  for (const change of changes)
    for (const wrote of change.rows ?? []) {
      seq++
      if (!ofTheApp(o, wrote.table)) continue
      const id = String(wrote.row.id)
      const key = `${wrote.table}\n${id}`
      const columns = setBy(o, wrote)
      const held = nets.get(key)
      if (held) {
        held.gone = wrote.kind === 'removed'
        for (const one of columns) held.columns.add(one)
        held.to = change.n
        held.seq = seq
        continue
      }
      // A removed row is kept as it was, and a changed one with what it held before.
      const before = wrote.kind === 'added' ? undefined : wrote.kind === 'removed' ? wrote.row : wrote.before
      nets.set(key, {
        table: wrote.table,
        id,
        ...(before ? { first: before } : {}),
        gone: wrote.kind === 'removed',
        columns: new Set(columns),
        since: change.n,
        to: change.n,
        sinceAt: change.at,
        seq,
        blind: wrote.kind === 'changed' && wrote.before === undefined,
        ...(change.file ? { file: change.file } : {}),
      })
    }
  return nets
}

/**
 * What others wrote in the same time, by the numbers of their writes: each row they wrote, the tables a raw write
 * of theirs stated or every table where it stated none, and the files of tenants that were fetched whole. A write
 * that set only what the engine works out, as a kept count, writes no row of a person.
 */
function othersOf(o: Opened, changes: SinkChange[]) {
  const rows = new Map<string, Since[]>()
  const raw: { n: number; tables?: string[]; all?: true }[] = []
  const fetched = new Map<string, number[]>()
  for (const change of changes) {
    for (const wrote of change.rows ?? []) {
      if (!ofTheApp(o, wrote.table)) continue
      if (wrote.kind === 'changed' && !setBy(o, wrote).length) continue
      const key = `${wrote.table}\n${String(wrote.row.id)}`
      const before = wrote.kind === 'removed' ? wrote.row : wrote.before
      rows.set(key, [...(rows.get(key) ?? []), { n: change.n, ...(before ? { before } : {}) }])
    }
    if (change.tables || change.all)
      raw.push({
        n: change.n,
        ...(change.tables ? { tables: change.tables } : {}),
        ...(change.all ? { all: true } : {}),
      })
    if (change.fetch && change.file)
      fetched.set(fileKey(change.file), [...(fetched.get(fileKey(change.file)) ?? []), change.n])
  }
  return {
    /** The writes by others of the row after the work's first write of it, the first of them first. */
    of: (net: Net): Since[] => (rows.get(`${net.table}\n${net.id}`) ?? []).filter((one) => one.n > net.since),
    /** Whether a raw write by others, or a fetch of its file, may have written the row after the work did. */
    blindly: (net: Net): boolean =>
      raw.some((one) => one.n > net.since && (one.all === true || one.tables?.includes(net.table) === true)) ||
      (fetched.get(fileKey(net.file)) ?? []).some((n) => n > net.since),
  }
}

/**
 * Takes an app, the call that undoes, which work is undone - by whom its changes were made, and from which moment
 * - and whether it is dry. Reads the changes from the archive, and works out for each row what the work did to it,
 * from the row before its first write to its last. A row that someone else wrote after the work's first write of
 * it is known so by the numbers of the writes and by whom they were made, never by its values: a write of the row,
 * a raw write that stated its table or none, a fetch of its file, and a put-back of the data or of its file. Such a
 * row is left and named in `clashes`, with what the work left in it where a write since says, as is a row it added
 * that a row the undo leaves now links to, and each change in that time that names no one. Every other row is taken
 * back, in the reverse order of its writes: a row it added is removed, a row it set gets its values before back, a
 * row it removed is put back with its id, and a row it added and removed again is left gone. It is all one write
 * as a change is carried out, made by the caller of the undo: the kept numbers, `onRemove`, the triggers, the
 * searcher and the files follow it, and it can be undone in its turn. Dry, it answers the same and writes nothing.
 * Throws T2028 where the app keeps no archive.
 */
export async function undoneBy(
  o: Opened,
  cx: CallContext,
  how: { matches(by: By): boolean; from: number; dry: boolean },
): Promise<Undone> {
  const archive = archiveOf(o)
  if (!archive)
    throw new TentError('T2028', 'This app keeps no archive of its changes: undo reaches back as far as it does.', {
      fix: 'Leave `archive` of `backups` on, the default: undo reaches back as far as the archive.',
    })
  const until = o.clock.now()
  const ofWork = (change: SinkChange): boolean => change.by !== undefined && how.matches(change.by)
  // The archive is read twice, a part at a time: first the changes of the work, then of what others wrote only
  // the rows that the work wrote, every raw write and fetch, and each change that names no one. So an undo holds what it undoes, and no more.
  const mine: SinkChange[] = []
  await archive.eachBetween(how.from, until, (change) => {
    if (ofWork(change)) mine.push(change)
  })
  const nets = netsOf(
    o,
    mine.sort((a, b) => a.n - b.n),
  )
  const theirs: SinkChange[] = []
  await archive.eachBetween(how.from, until, (change) => {
    if (ofWork(change)) return
    // A change that names no one is named whole: every row of it may be of the work.
    const rows = (change.rows ?? []).filter(
      (wrote) => change.by === undefined || nets.has(`${wrote.table}\n${String(wrote.row.id)}`),
    )
    if (rows.length || change.tables || change.all || change.fetch) theirs.push({ ...change, rows })
  })
  const others = othersOf(
    o,
    theirs.sort((a, b) => a.n - b.n),
  )
  // The data, or the file of one tenant, put back since the work began: what the work wrote there may stand otherwise.
  const puts: PutBack[] = (await archive.backups()).restores.filter((one) => one.at >= how.from)
  const putOver = (net: Net): boolean =>
    puts.some((one) => one.at >= net.sinceAt && (!one.of || fileKey(one.of) === fileKey(net.file)))
  const clashes: Clash[] = []
  const taken: Net[] = []
  for (const net of [...nets.values()].sort((a, b) => b.seq - a.seq)) {
    // A row the work added and removed again, and one in which it moved only what the engine works out, stand.
    if (!net.first && net.gone) continue
    if (net.first && !net.gone && !net.columns.size) continue
    const now = standing(o, net)
    const since = others.of(net)
    // A row that stands otherwise than the work left it, in being or not, was written by someone the archive
    // does not name.
    const otherwise = net.gone ? now !== undefined : now === undefined
    const unseen = others.blindly(net) || putOver(net) || otherwise
    if (net.blind || since.length || unseen) {
      // What the work left: the row before the first write by another after the work's last one, or the row as it
      // stands where nobody else wrote it.
      const left = since.length ? since.find((one) => one.n > net.to)?.before : unseen ? undefined : now
      const columns = net.columns.size
        ? [...net.columns]
        : Object.keys(left ?? now ?? {}).filter((one) => !moments.includes(one))
      clashes.push({
        table: net.table,
        id: net.id,
        columns,
        ...(left && !net.gone ? { left: shown(left, columns) } : {}),
        ...(now ? { now: shown(now, columns) } : {}),
      })
      continue
    }
    taken.push(net)
  }
  // A row the work added stays where a row the undo leaves links to it.
  const removed = new Set(taken.filter((net) => !net.first).map((net) => `${net.table}\n${net.id}`))
  const steps = taken.filter((net) => {
    if (net.first || !linkedTo(o, net, removed)) return true
    removed.delete(`${net.table}\n${net.id}`)
    const now = standing(o, net)
    const all = Object.keys(now ?? {}).filter((one) => !moments.includes(one))
    clashes.push({ table: net.table, id: net.id, columns: [], left: shown(now, all), now: shown(now, all) })
    return false
  })
  // A change that names no one may be of the work: it is named, and nothing of it is taken back.
  const unknown = new Set<string>()
  for (const change of theirs)
    if (change.by === undefined)
      for (const row of change.rows ?? [])
        if (ofTheApp(o, row.table) && !unknown.has(`${row.table}\n${String(row.row.id)}`)) {
          unknown.add(`${row.table}\n${String(row.row.id)}`)
          clashes.push({ table: row.table, id: String(row.row.id), columns: [], by: 'unknown' })
        }
  if (!how.dry && steps.length) {
    const by = byWhom(cx.caller, cx.run?.id)
    // One write is one file: the rows of each file of a tenant are taken back in a write of their own.
    const byFile = new Map<string, Net[]>()
    for (const net of steps) byFile.set(fileKey(net.file), [...(byFile.get(fileKey(net.file)) ?? []), net])
    for (const nets of byFile.values())
      await systemWrite(
        o,
        'an undo',
        (db, open, told) => {
          for (const net of nets) {
            const tx = open.tx ?? open.writing?.tx(net.file)
            if (!net.first) {
              const stated: unknown = Reflect.get(db, net.table)
              const column: unknown = Reflect.get(Object(o.description.tables[net.table]), 'tenant')
              // A row of a tenant table is removed through its tenant, which the row names as it stands.
              const table: unknown =
                typeof column === 'string'
                  ? Reflect.apply(Reflect.get(Object(stated), 'of'), stated, [standing(o, net)?.[column]])
                  : stated
              Reflect.apply(Reflect.get(Object(table), 'remove'), table, [net.id])
            } else if (tx) {
              const worked = workedOut(o, net.table)
              const values = !net.gone
                ? Object.fromEntries([...net.columns].map((column) => [column, net.first?.[column] ?? null]))
                : Object.fromEntries(Object.entries(net.first).filter(([column]) => !worked.has(column)))
              for (const w of putBack(tx, o.description, net.table, net.id, values)) told(w)
            }
          }
        },
        { full: true, by },
      )
  }
  return { undone: steps.length, clashes, outside: [] }
}
