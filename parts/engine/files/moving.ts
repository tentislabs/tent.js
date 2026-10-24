import { TentError } from '../../core/index.ts'
import type { FileName, Row, TableLayout, Tx } from '../../data/index.ts'
import { applySteps, layoutOf } from '../../data/index.ts'
import type { Opened } from '../opened.ts'
import { rowsIn } from './directory.ts'
import type { TenantFiles } from './face.ts'
import { metaOf } from '../held.ts'
import { addFilled, dropFilled, filledOf } from './movedFilled.ts'
import { addKept, dropKept, keptVersionsOf } from './movedKept.ts'
import { table as holds } from '../tables/holds.ts'

const system = { kind: 'system' } as const

// The table of a data file that holds what the file says of itself, and the key that a move is noted under.
const meta = '_t_meta'
const key = 'move'

/** One table whose rows move: into the files of its tenants, or out of them into the shared file. */
export interface Moved {
  table: string
  // The table of its tenants.
  by: string
  way: 'in' | 'out'
}

/** A move as the shared file notes it, from before its first row is added until no row of it is left in a place it left. */
export interface Note {
  version: string
  moves: Moved[]
  // The layout of the app that the move leads to.
  to: TableLayout[]
  // The layout of the app that it leaves: what the files are told again where the move is undone.
  from: TableLayout[]
  // The switch has taken its write: what is left is to take the rows out of the files they left.
  ended?: true
}

const isNote = (held: unknown): held is Note =>
  typeof held === 'object' && held !== null && Array.isArray(Reflect.get(held, 'moves'))

/** The table of the tenants of a table, in a layout: the one its `tenant` column links to. */
function byOf(one: TableLayout | undefined): string | undefined {
  const type = one?.tenant === undefined ? undefined : one.columns[one.tenant]
  return type?.kind === 'link' ? type.table : undefined
}

/** The tables that gain or lose `tenant` from one layout to the other. */
export function movesOf(from: TableLayout[], to: TableLayout[]): Moved[] {
  const moves: Moved[] = []
  for (const next of to) {
    const [was, now] = [byOf(from.find((one) => one.name === next.name)), byOf(next)]
    if (!from.some((one) => one.name === next.name) || (was === undefined) === (now === undefined)) continue
    moves.push(
      now === undefined ? { table: next.name, by: String(was), way: 'out' } : { table: next.name, by: now, way: 'in' },
    )
  }
  return moves
}

/** Writes the note of a move into the shared file, inside a write, or takes it away. */
export function noteMove(tx: Tx, note: Note | undefined): void {
  const there = tx.read({ from: meta, one: 'get', id: key }, system) !== undefined
  if (!note) {
    if (there) tx.remove(meta, key, system)
  } else if (there) tx.change(meta, key, { value: note }, system)
  else tx.add(meta, { key, value: note }, system)
}

const rowsOf = (read: unknown): Row[] => (Array.isArray(read) ? read : [])

/** The files of the directory that stand on the disk under one table. */
const filesOf = (tenantFiles: TenantFiles, by: string): FileName[] =>
  rowsIn(tenantFiles.files.shared)
    .filter((row) => row.file.table === by && tenantFiles.files.has(row.file))
    .map((row) => row.file)

const turn = (): Promise<void> => new Promise((done) => setImmediate(done))

/** The error of rows that a `unique` rule of the whole app does not take, with the table, the tenant and the count. */
const refusal = (table: string, file: FileName, rows: number): TentError =>
  new TentError(
    'T2001',
    `${rows === 1 ? '1 row' : `${rows} rows`} of \`${table}\` cannot be moved into the shared file, where a \`unique\` rule holds for the whole app, from the data file of ${file.table} ${file.id}.`,
    { fix: 'Change those rows so that no two tenants share the value, and take the version with `--move` again.' },
  )

/** Every row of a table that one data file of a tenant holds. */
async function heldRows(tenantFiles: TenantFiles, file: FileName, table: string): Promise<Row[]> {
  await tenantFiles.raise(file)
  const store = tenantFiles.files.of(file)
  return store?.layout().some((one) => one.name === table) ? rowsOf(store.read({ from: table }, system).value) : []
}

/**
 * Adds rows to a table of the shared file inside one write, each with its id and its two moments. Answers how
 * many of them a `unique` rule refused: the write goes on after such a row.
 */
function added(tx: Tx, table: string, rows: Row[]): number {
  let refused = 0
  for (const row of rows)
    try {
      tx.add(table, row, system)
    } catch (error) {
      if (!(error instanceof TentError) || error.code !== 'T2101') throw error
      refused++
    }
  return refused
}

/** What ends a write that only counts: it is undone, and the count is what it was made for. */
class Counted extends Error {
  found: { table: string; file: FileName; rows: number } | undefined
  constructor(found: Counted['found']) {
    super('a move was counted')
    this.found = found
  }
}

/**
 * Counts, with nothing changed, what a move out of the files would be refused for: every row is added to the
 * shared file inside one write, which is undone. Throws T2001 for the first tenant whose rows a `unique` rule of
 * the whole app does not take.
 */
export async function countMove(o: Opened, tenantFiles: TenantFiles, moves: Moved[], to: TableLayout[]): Promise<void> {
  const out = moves.filter((one) => one.way === 'out')
  const held: { table: string; file: FileName; rows: Row[] }[] = []
  for (const { table, by } of out)
    for (const file of filesOf(tenantFiles, by))
      held.push({ table, file, rows: await heldRows(tenantFiles, file, table) })
  if (!held.length) return
  try {
    tenantFiles.own(() =>
      o.store.write(
        (tx) => {
          made(o, tx, out, to)
          for (const one of held) {
            const rows = added(tx, one.table, one.rows)
            if (rows) throw new Counted({ table: one.table, file: one.file, rows })
          }
          throw new Counted(undefined)
        },
        { steps: true },
      ),
    )
  } catch (error) {
    if (!(error instanceof Counted)) throw error
    if (error.found) throw refusal(error.found.table, error.found.file, error.found.rows)
  }
}

/** Makes, inside a write of the shared file, each table that moves out of the files and that the shared file lacks. */
function made(o: Opened, tx: Tx, out: Moved[], to: TableLayout[]): void {
  const there = new Set(o.store.layout().map((one) => one.name))
  const lacking = to.filter((one) => out.some((move) => move.table === one.name) && !there.has(one.name))
  if (lacking.length)
    applySteps(
      tx,
      o.store,
      lacking.map((layout) => ({ do: 'addTable', table: layout.name, layout })),
    )
}

/**
 * Inside the write of the shared file that ends a move, before the rows leave it: the holds of the rows of each
 * table that moves are written anew with the tenant whose file the rows go to, or with none for rows that leave
 * the files of tenants. So a file that such a row holds is held by its row where it stands now.
 */
export function holdsMoved(tx: Tx, moves: Moved[], to: TableLayout[]): void {
  for (const { table, way } of moves) {
    const held = rowsOf(tx.read({ from: holds.name, where: { col: 'tableName', is: table } }, system))
    if (!held.length) continue
    const column = to.find((one) => one.name === table)?.tenant ?? ''
    const tenants =
      way === 'in'
        ? new Map(rowsOf(tx.read({ from: table }, system)).map((row) => [String(row.id), String(row[column])]))
        : new Map<string, string>()
    for (const hold of held) {
      const of = tenants.get(String(hold.rowId)) ?? null
      if ((hold.of ?? null) === of || (way === 'in' && of === null)) continue
      const { file, tableName, rowId, column: name, keptAt } = hold
      tx.change(holds.name, { file, tableName, rowId, column: name, keptAt }, { of }, system)
    }
  }
}

/**
 * Takes every row of a table out of the place that the rows left, inside a write, with their kept earlier versions
 * and their rows of `_t_filled`.
 */
export function emptied(tx: Tx, table: string): void {
  tx.sql(`DELETE FROM "${table}"`, [], [table])
  dropKept(tx, table)
  dropFilled(tx, table)
}

/** Adds the rows of each table that moves where they go, a tenant at a time, each tenant in one write. */
async function addRows(o: Opened, tenantFiles: TenantFiles, moves: Moved[], to: TableLayout[]): Promise<void> {
  const out = moves.filter((one) => one.way === 'out')
  if (out.length) tenantFiles.own(() => o.store.write((tx) => made(o, tx, out, to), { steps: true }))
  // The files are told the layout that the move leads to before a row is added to one: a table that gains
  // `tenant` is made in the file of its tenant with its first row.
  if (moves.some((one) => one.way === 'in')) tenantFiles.follow(to)
  for (const { table, by, way } of moves) {
    if (way === 'out') {
      for (const file of filesOf(tenantFiles, by)) {
        const rows = await heldRows(tenantFiles, file, table)
        // The kept earlier versions of the rows go with them, in the same write.
        const kept = keptVersionsOf(tenantFiles.files.of(file), table)
        const filled = filledOf(tenantFiles.files.of(file), table)
        let refused = 0
        try {
          tenantFiles.own(() =>
            o.store.write((tx) => {
              refused = added(tx, table, rows)
              if (refused) throw new Counted(undefined)
              addKept(tx, kept)
              addFilled(tx, filled)
            }),
          )
        } catch (error) {
          if (!(error instanceof Counted)) throw error
          throw refusal(table, file, refused)
        }
        if (o.closed) throw new TentError('T0013', 'The app was closed while its rows moved.')
        await turn()
      }
      continue
    }
    const column = to.find((one) => one.name === table)?.tenant ?? ''
    const byTenant = new Map<string, Row[]>()
    for (const row of rowsOf(o.store.read({ from: table }, system).value)) {
      const tenant = String(row[column])
      byTenant.set(tenant, [...(byTenant.get(tenant) ?? []), row])
    }
    for (const [id, rows] of byTenant) {
      const file = { table: by, id }
      // A file that stands at the layout before is brought up first, as before anything else writes it.
      await tenantFiles.raise(file)
      const ids = new Set(rows.map((row) => String(row.id)))
      const [kept, filled] = [keptVersionsOf(o.store, table, ids), filledOf(o.store, table, ids)]
      tenantFiles.own(() =>
        tenantFiles.files.write((w) => {
          const tx = w.tx(file)
          for (const row of rows) tx.add(table, row, system)
          addKept(tx, kept)
          addFilled(tx, filled)
        }),
      )
      if (o.closed) throw new TentError('T0013', 'The app was closed while its rows moved.')
      await turn()
    }
  }
}

/**
 * Takes what the engine holds of an app, its files, the moves of a switch, the version and the layout they lead
 * to. Notes the move in the shared file, holds every write of a table that moves, and adds the rows where they
 * go, a tenant at a time, each tenant in one write, each row with its id and its two moments. No row leaves its
 * place: a read is answered from where the rows stand. A row that cannot be added undoes the move, and throws
 * T2001 with the table, the tenant and the count. Answers what ends the hold, once the switch has taken its write
 * or was refused.
 */
export async function moveRows(
  o: Opened,
  tenantFiles: TenantFiles,
  moves: Moved[],
  version: string,
  from: TableLayout[],
  to: TableLayout[],
): Promise<{ release(): void; note: Note }> {
  let release = (): void => undefined
  const done = new Promise<void>((kept) => {
    release = () => {
      tenantFiles.moving(undefined)
      kept()
    }
  })
  const note: Note = { version, moves, from, to }
  o.store.write((tx) => noteMove(tx, note))
  tenantFiles.moving(new Set(moves.map((one) => one.table)), done)
  try {
    await addRows(o, tenantFiles, moves, to)
  } catch (error) {
    if (!o.closed) await undoMove(o, tenantFiles, note)
    release()
    throw error
  }
  return { release, note }
}

/**
 * Takes a move that did not end. Removes what it added, so that every row is where it was and none is there
 * twice: the rows that it added to the files of tenants, or to the shared file. Then the files are told the
 * layout of the version that runs again, and the note of the move is taken away.
 */
export async function undoMove(o: Opened, tenantFiles: TenantFiles, note: Note): Promise<void> {
  await takeAway(o, tenantFiles, note, true)
}

/**
 * Takes a move whose rows were added, and into which a raw text that states no table wrote since: what was added
 * may be old. Removes what the move added and adds the rows anew, from where they still stand. A row that cannot
 * be added undoes the move, as when the rows were first added.
 */
export async function addAgain(o: Opened, tenantFiles: TenantFiles, note: Note): Promise<void> {
  await takeAway(o, tenantFiles, note, false)
  await addRows(o, tenantFiles, note.moves, note.to)
}

/** Removes the rows that a move added. With `last` the move is over: the files and the shared file are told so. */
async function takeAway(o: Opened, tenantFiles: TenantFiles, note: Note, last: boolean): Promise<void> {
  const [into, out] = [note.moves.filter((one) => one.way === 'in'), note.moves.filter((one) => one.way === 'out')]
  if (into.length) {
    // The files that the move wrote stand at the layout it leads to, and are written at that layout.
    tenantFiles.follow(note.to)
    for (const { table, by } of into)
      for (const file of filesOf(tenantFiles, by)) {
        await tenantFiles.raise(file)
        if (
          !tenantFiles.files
            .of(file)
            ?.layout()
            .some((one) => one.name === table)
        )
          continue
        tenantFiles.own(() => tenantFiles.files.write((w) => emptied(w.tx(file), table)))
      }
    await tenantFiles.idle()
    if (last) tenantFiles.follow(note.from)
  }
  tenantFiles.own(() =>
    o.store.write((tx) => {
      for (const { table } of out) if (o.store.layout().some((one) => one.name === table)) emptied(tx, table)
      if (last) noteMove(tx, undefined)
    }),
  )
}

/**
 * Takes what the engine holds of an app whose switch with a move has taken its write. Takes the rows of each
 * table that lost `tenant` out of the files they left, a file at a time, then tells the files the layout that
 * runs, and takes the note of the move away.
 */
export async function leaveFiles(o: Opened, tenantFiles: TenantFiles, note: Note): Promise<void> {
  for (const { table, by } of note.moves.filter((one) => one.way === 'out'))
    for (const file of filesOf(tenantFiles, by)) {
      if (o.closed) return
      await tenantFiles.raise(file)
      if (
        !tenantFiles.files
          .of(file)
          ?.layout()
          .some((one) => one.name === table)
      )
        continue
      tenantFiles.own(() => tenantFiles.files.write((w) => emptied(w.tx(file), table)))
      await turn()
    }
  await tenantFiles.idle()
  if (o.closed) return
  tenantFiles.follow(note.to)
  o.store.write((tx) => noteMove(tx, undefined))
}

/** The note of a move that the shared file of an app holds, or nothing. */
function moveNoted(o: Opened): Note | undefined {
  const held = metaOf(o.store, key)
  return isNote(held) ? held : undefined
}

// The readers whose files were told the layout of a move of their writer: the one it leads to, or the one it left.
const following = new WeakMap<TenantFiles, 'to' | 'from'>()

/** The layout that a move noted in the shared file holds the files of a reader to, as its writer holds its own. */
function movedLayout(note: Note | undefined): { at: 'to' | 'from'; layout: TableLayout[] } | undefined {
  if (note === undefined) return undefined
  // While rows are added to the files, they hold the layout that the move leads to.
  if (!note.ended && note.moves.some((one) => one.way === 'in')) return { at: 'to', layout: note.to }
  // While rows are taken out of the files they left, those files hold the layout they had.
  if (note.ended && note.moves.some((one) => one.way === 'out')) return { at: 'from', layout: note.from }
  return undefined
}

/**
 * Takes what a reader holds of its app. Answers the layout its files are told for the version that runs: the
 * layout of a move of its writer that is under way, or that of the version.
 */
export const followedLayout = (o: Opened): TableLayout[] => movedLayout(moveNoted(o))?.layout ?? layoutOf(o.description)

/**
 * Takes what a reader holds of its app, and its files, after a change of the shared file was applied. While the
 * shared file notes a move that adds rows to the files of tenants, the files are told the layout that the move
 * leads to, as the writer told its own: so each row that the writer adds finds its table in the file of its
 * tenant here too. While it notes one whose rows leave the files, they keep the layout they had, so that the
 * writer's taking of those rows out of each file reaches them. A move that was undone, or has ended, leaves the
 * files with the layout of the version that runs.
 */
export function followMove(o: Opened, tenantFiles: TenantFiles): void {
  const note = moveNoted(o)
  const moved = movedLayout(note)
  if (moved?.at === following.get(tenantFiles)) return
  if (moved) {
    following.set(tenantFiles, moved.at)
    tenantFiles.follow(moved.layout)
    return
  }
  const was = following.get(tenantFiles)
  following.delete(tenantFiles)
  // The version that the move led to runs now, and has told the files its layout: otherwise the move was undone.
  if (was === 'from' || o.version !== note?.version) tenantFiles.follow(layoutOf(o.description))
}

/**
 * Takes what the engine holds of an app that opens, and its files. Where the shared file notes a move, the engine
 * was stopped in the middle of it. A move whose switch had not taken its write is undone: what it added is
 * removed, and the app goes on with the version it had. One whose switch had taken its write is ended: the rows
 * are taken out of the files they left.
 */
export async function endMove(o: Opened, tenantFiles: TenantFiles): Promise<void> {
  const note = moveNoted(o)
  if (!note) return
  tenantFiles.line('warn', 'A move of rows had not ended when the engine stopped.', {
    version: note.version,
    ended: note.ended === true,
  })
  if (!note.ended) return undoMove(o, tenantFiles, note)
  // The files that the rows leave are opened as the files of their tenants once more.
  tenantFiles.follow(note.from)
  await leaveFiles(o, tenantFiles, note)
}
