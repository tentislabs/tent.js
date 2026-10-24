import { existsSync, mkdirSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { Session, StatementSync } from 'node:sqlite'
import { backup, constants, DatabaseSync } from 'node:sqlite'
import { openSqlite, sqlitePath } from '../sqliteFile.ts'
import { TentError } from '../../core/index.ts'
import { isId, rowIds } from '../ids.ts'
import { keptIn } from '../kept.ts'
import { keepPlace, toDiskWrite } from '../place.ts'
import type { OpenWrite, Store, StoreCopy, TableLayout, Tx } from '../store.ts'
import { vectorFrom } from '../vector.ts'
import type { VectorCopy } from './copy.ts'
import { vectorCopy } from './copy.ts'
import { smallCopy } from './smallCopy.ts'
import { vectorColumns, vectorTable } from './ddl.ts'
import { failed, sqliteFailed } from './failed.ts'
import { guarded } from './guard.ts'
import { hasMeta, layoutsIn, shapeNumber, makeMeta, metaOf } from './meta.ts'
import { q } from './names.ts'
import { explainPlan, readPlan } from './plan.ts'
import { dropSearchSql, searchIndexName, searchSql } from './search.ts'
import { rowWrites } from './rows.ts'
import type { Held, Shape } from './shape.ts'
import { noTable, shapeOf } from './shape.ts'
import { runSteps, withARow } from './steps.ts'
import { nearest } from './wide.ts'

/** SQLite's own name for a file that is kept in memory alone, which a store is handed to open in place of a path: https://sqlite.org/inmemorydb.html */
export const inMemory = ':memory:'

// The cache of the shared file, in bytes.
const sharedCache = 64 * 1_048_576

/** What an open file holds beside its connection. */
interface Open {
  db: DatabaseSync
  file: string
  readOnly: boolean
  layouts: Map<string, TableLayout>
  shapes: Map<string, Shape>
  statements: Map<string, StatementSync>
  raw: Map<string, { statement: StatementSync; writes: boolean }>
  // The copy in memory of the vectors of each vector column, under its table and its column.
  copies: Map<string, VectorCopy>
  lazy: boolean
  // A searcher of the builder's own is connected: the store keeps no search index and no trigger for one.
  noSearch: boolean
  // The tables whose search index was seen to be there.
  indexed: Set<string>
  // The tables that a record covers, worked out once for the layouts the file holds.
  covered?: string[]
}

/** What a write holds of its record: whether it is recorded, its sessions, what was taken of earlier ones, and its vectors. */
interface Recorded {
  recording: boolean
  // The sessions that record this write, by the table each records, and what was taken of earlier ones. A table's
  // is opened before the first change of that table: a write that changes few tables opens few sessions.
  sessions: Map<string, Session>
  taken: Uint8Array[]
  // Each vector this write set or removed: the copies are told once it is committed.
  vectors: { table: string; column: string; n: number; vector: Float32Array | undefined }[]
}

/** What the record of a write is made with: the file that is open, and the write that is under way. */
interface Recording {
  opened(): { db: DatabaseSync; layouts: Map<string, TableLayout>; covered?: string[] }
  writing(): Recorded | undefined
  shape: Held['shape']
}

/** The one write that is under way. */
interface Writing extends Recorded {
  steps: boolean
  touched: Map<string, Set<string>>
  changedLayout: boolean
  // The inside numbers of the rows that this write added, by their table, for the tables with a vector column.
  fresh: Map<string, Set<number>>
  // The write wrote a row of a table that a record covers.
  wrote: boolean
}

const readOnlyError = (): TentError =>
  new TentError('T0012', 'A write was tried through a store that only reads.', {
    fix: 'Write inside a change, through the store that was opened for writing.',
  })

/**
 * Takes what answers the open file and the write under way. Answers the half of a store that copies it to the
 * readers of an app: `copy`, as `Store` gives it, whether the store records its writes, and what opens and takes
 * the sessions of a write, since a table change is no part of a record.
 */
function recorded(o: Recording): {
  copy: StoreCopy
  keeping(): boolean
  stop(): void
  record(now: Recorded): void
  touch(now: Recorded, table?: string): void
  take(now: Recorded): void
} {
  // From `copy.keep()` on every write is recorded, until the store is closed.
  let keeping = false

  /** The tables that a record covers: every table that is no machine's own, with the table of each vector column. */
  const covered = (): string[] => {
    const at = o.opened()
    at.covered ??= [...at.layouts.values()]
      .filter((layout) => !layout.own)
      .flatMap((layout) => [layout.name, ...vectorColumns(layout).map((column) => vectorTable(layout.name, column))])
    return at.covered
  }

  /** The inside number of the row of a table that an id names, or nothing. */
  const numberOf = (table: string, id: unknown): number | undefined => {
    const row = o
      .opened()
      .db.prepare(`SELECT "_n" FROM ${q(table)} WHERE "id" = ?`)
      .get(String(id))
    return row ? Number(row._n) : undefined
  }

  /** The sessions of a write in the order of the tables a record covers, so that one write gives one record. */
  const inOrder = (now: Recorded): Session[] =>
    covered().flatMap((table) => {
      const session = now.sessions.get(table)
      return session ? [session] : []
    })

  /**
   * Opens the sessions of a write that is recorded before a change: of the table it changes, with the tables of its
   * vector columns, or of every table a record covers where the change may reach any. A table no record covers
   * opens none. The store changes a table only through a write that names it, as no link of its tables cascades.
   */
  const touch = (now: Recorded, table?: string): void => {
    if (!now.recording || (table !== undefined && now.sessions.has(table))) return
    const at = o.opened()
    const layout = table === undefined ? undefined : at.layouts.get(table)
    if (table !== undefined && (!layout || layout.own)) return
    const tables = layout
      ? [layout.name, ...vectorColumns(layout).map((column) => vectorTable(layout.name, column))]
      : covered()
    for (const one of tables) if (!now.sessions.has(one)) now.sessions.set(one, at.db.createSession({ table: one }))
  }

  const copy: StoreCopy = {
    keep() {
      keeping = true
    },
    record() {
      const now = o.writing()
      if (!now) throw new TentError('T0013', 'A record is asked for outside a write.')
      const parts = [...now.taken, ...inOrder(now).map((session) => session.changeset())]
      const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
      let at = 0
      for (const part of parts) {
        bytes.set(part, at)
        at += part.length
      }
      return bytes
    },
    apply(bytes, rows = []) {
      const at = o.opened()
      const now = o.writing()
      if (!now) throw new TentError('T0013', 'A record is applied outside a write.')
      // The copy of the vectors is kept by the inside number of a row, which is read before a removed row is gone.
      const vectored = rows.flatMap((one) => {
        const layout = at.layouts.get(one.table)
        const columns = layout && !layout.key && !layout.retired ? Object.keys(o.shape(one.table).vectors) : []
        return columns.length ? [{ ...one, columns }] : []
      })
      const gone = vectored.flatMap((one) =>
        one.kind === 'removed' ? [{ ...one, n: numberOf(one.table, one.row.id) }] : [],
      )
      const tables = new Set(covered())
      const clash = () =>
        new TentError(
          'T0033',
          'A change does not fit the store it is applied to: a row is held otherwise than its record expects.',
          {
            fix: 'Move the data file aside and fetch the data anew from the writer.',
          },
        )
      let fits = true
      touch(now)
      try {
        if (bytes.length)
          fits = at.db.applyChangeset(bytes, {
            filter: (table) => tables.has(table),
            onConflict: () => constants.SQLITE_CHANGESET_ABORT,
          })
      } catch {
        // SQLite refuses a record that would leave a link without its row, or break a rule of a table, by throwing.
        fits = false
      }
      if (!fits) throw clash()
      for (const { table, columns, n } of gone)
        if (n !== undefined) for (const column of columns) now.vectors.push({ table, column, n, vector: undefined })
      for (const one of vectored) {
        const n = one.kind === 'removed' ? undefined : numberOf(one.table, one.row.id)
        if (n === undefined) continue
        for (const column of one.columns) {
          const kept = at.db.prepare(`SELECT "v" FROM ${q(vectorTable(one.table, column))} WHERE "_n" = ?`).get(n)
          const vector = kept?.v instanceof Uint8Array ? vectorFrom(kept.v) : undefined
          now.vectors.push({ table: one.table, column, n, vector })
        }
      }
    },
  }

  return {
    copy,
    keeping: () => keeping,
    stop() {
      keeping = false
    },
    record(now) {
      now.recording = true
    },
    touch,
    take(now) {
      for (const session of inOrder(now)) {
        const bytes = session.changeset()
        if (bytes.length) now.taken.push(bytes)
      }
      for (const session of now.sessions.values()) session.close()
      now.sessions.clear()
      now.recording = false
    },
  }
}

/**
 * Answers a store over the runtime's own SQLite: one data file, one connection, one write at a time. It speaks
 * text ids only and keeps the inside number of a row to itself. It applies no access rule.
 */
export function sqliteStore(): Store {
  const ids = rowIds
  let open: Open | undefined
  let writing: Writing | undefined

  const opened = (): Open => {
    if (!open) throw new TentError('T0009', 'The store is not open.')
    return open
  }
  const held: Held = {
    get db() {
      return opened().db
    },
    ids,
    statement(sql) {
      const { db, statements } = opened()
      return keptIn(statements, sql, () => db.prepare(sql))
    },
    shape(table) {
      const { layouts, shapes } = opened()
      const layout = layouts.get(table)
      if (!layout) throw noTable(table)
      return keptIn(shapes, table, () => shapeOf(layout))
    },
    copy(table, column) {
      const at = opened()
      // A store that only reads keeps no copy: it reads every vector from the table for the one search.
      if (at.readOnly) return copyOf(at, table, column)
      return keptIn(at.copies, copyKey(table, column), () => copyOf(at, table, column))
    },
    fresh: (table) => writing?.fresh.get(table),
    indexed(table) {
      const at = opened()
      if (at.noSearch)
        throw new TentError('T0009', `The store keeps no search index of \`${table}\` while a searcher is connected.`)
      if (at.indexed.has(table)) return
      const layout = at.layouts.get(table)
      if (!layout) throw noTable(table)
      if (!hasIndex(at, table)) {
        if (at.readOnly)
          throw new TentError(
            'T0009',
            `The data file holds no search index of \`${table}\`, and this store only reads.`,
          )
        aside(at, searchSql(layout))
      }
      at.indexed.add(table)
    },
  }

  const hasIndex = (at: Open, table: string): boolean =>
    at.db.prepare('SELECT 1 FROM sqlite_master WHERE "name" = ?').get(searchIndexName(table)) !== undefined

  /** Carries out statements that make or drop what no record covers, as a search index: in the write under way, or in one of their own. */
  const aside = (at: Open, statements: string[]) => {
    if (writing) {
      for (const sql of statements) at.db.exec(sql)
      return
    }
    at.db.exec('PRAGMA query_only = OFF')
    try {
      at.db.exec('BEGIN IMMEDIATE')
      for (const sql of statements) at.db.exec(sql)
      at.db.exec('COMMIT')
    } catch (error) {
      if (at.db.isTransaction) at.db.exec('ROLLBACK')
      throw failed(error, '')
    } finally {
      at.db.exec('PRAGMA query_only = ON')
    }
  }

  /** Keeps the search index of each searched table, or none of them: a searcher of the builder's own takes their place. */
  const searchIndex = (keep: boolean) => {
    const at = opened()
    at.noSearch = !keep
    at.indexed.clear()
    if (at.readOnly) return
    const searched = [...at.layouts.values()].filter((layout) => layout.search.length && !layout.retired)
    const statements = searched.flatMap((layout) =>
      hasIndex(at, layout.name) === keep ? [] : keep ? searchSql(layout) : dropSearchSql(layout.name),
    )
    if (statements.length) aside(at, statements)
  }

  const copyKey = (table: string, column: string): string => `${table} ${column}`

  /** Builds the copy of the vectors of a column, by one read of its table. */
  const copyOf = (at: Open, table: string, column: string): VectorCopy => {
    const type = at.layouts.get(table)?.columns[column]
    if (type?.kind !== 'vector') throw noTable(vectorTable(table, column))
    const copy = type.copy === 'small' ? smallCopy(type.size) : vectorCopy(type.size)
    const rows = at.db.prepare(`SELECT "_n", "v" FROM ${q(vectorTable(table, column))} ORDER BY "_n"`)
    for (const row of rows.iterate()) if (row.v instanceof Uint8Array) copy.set(Number(row._n), vectorFrom(row.v))
    return copy
  }

  /** Builds the copies of the vector columns anew: of one table, or of every table. A store opened with `lazy` builds each at its first search. */
  const buildCopies = (at: Open, only?: string) => {
    for (const key of [...at.copies.keys()]) if (only === undefined || key.startsWith(`${only} `)) at.copies.delete(key)
    if (at.readOnly || at.lazy) return
    for (const layout of at.layouts.values()) {
      if (layout.retired || (only !== undefined && layout.name !== only)) continue
      for (const column of vectorColumns(layout))
        if (!layout.unused?.includes(column))
          at.copies.set(copyKey(layout.name, column), copyOf(at, layout.name, column))
    }
  }

  /** Reads the layouts the file holds, and forgets what was worked out from the ones before. */
  const loadLayouts = (at: Open) => {
    at.layouts = new Map(hasMeta(at.db) ? layoutsIn(at.db).map((layout) => [layout.name, layout]) : [])
    forgetCompiled(at)
  }
  const forgetCompiled = (at: Open) => {
    at.covered = undefined
    at.shapes.clear()
    at.statements.clear()
    at.raw.clear()
    at.indexed.clear()
  }

  /** Carries a raw text of an app out, under the guards, and answers its rows as they are. */
  const raw = (text: string, values: unknown[], mayWrite: boolean): unknown[] => {
    const at = opened()
    const compiled = keptIn(at.raw, text, () => guarded(at.db, text))
    if (compiled.writes && !mayWrite) throw readOnlyError()
    if (compiled.writes && writing) {
      writing.wrote = true
      copying.touch(writing)
    }
    try {
      return compiled.statement.all(...values.map(bound)).map(nearest)
    } catch (error) {
      throw failed(error, '')
    }
  }

  const rows = rowWrites(
    held,
    (table, id) => {
      if (!writing) return
      keptIn(writing.touched, table, () => new Set<string>()).add(id)
      if (!opened().layouts.get(table)?.own) writing.wrote = true
    },
    (table, column, n, vector) => writing?.vectors.push({ table, column, n, vector }),
    (table, n) => {
      if (writing) keptIn(writing.fresh, table, () => new Set<number>()).add(n)
    },
  )

  const copying = recorded({ opened, writing: () => writing, shape: (table) => held.shape(table) })

  /** Carries one write of a row out: what SQLite or the runtime throws in it is thrown as an error of ours. */
  const row = <T>(table: string, write: () => T): T => {
    if (writing) copying.touch(writing, table)
    try {
      return write()
    } catch (error) {
      throw failed(error, table)
    }
  }

  const tx: Tx = {
    read: (plan) => readPlan(held, plan).value,
    add: (table, values) => row(table, () => rows.add(table, values)),
    change: (table, id, values) => row(table, () => rows.change(table, id, values)),
    remove: (table, id) => row(table, () => rows.remove(table, id)),
    sql(text, values, touches = []) {
      const answer = raw(text, values, true)
      // A table that the text stated is touched, with no ids: which of its rows were written is not known.
      for (const table of touches) if (writing) keptIn(writing.touched, table, () => new Set<string>())
      return answer
    },
    sqlRead: (text, values) => raw(text, values, false),
  }

  /**
   * Begins a write, which whoever began it ends: by committing it, which answers what was touched, or by undoing
   * it. A write of the files of tenants is begun when its first row names its file.
   */
  const begin = (o: { steps?: boolean; toDisk?: boolean } = {}): OpenWrite => {
    const at = opened()
    if (at.readOnly) throw readOnlyError()
    if (writing) throw new TentError('T0013', 'A write was begun inside a write: a store has one write at a time.')
    const steps = o.steps === true
    const toDisk = o.toDisk === true
    // A rebuild drops a table that others link to, and SQLite takes the switch of its link check only outside a write.
    if (steps) at.db.exec('PRAGMA foreign_keys = OFF')
    // SQLite lets its syncing change inside no write: with the full one a commit waits for the disk, and no
    // checkpoint is taken for it. https://sqlite.org/pragma.html#pragma_synchronous
    if (toDisk) at.db.exec('PRAGMA synchronous = FULL')
    held.statement('PRAGMA query_only = OFF').run()
    const now: Writing = {
      steps,
      touched: new Map(),
      changedLayout: false,
      vectors: [],
      fresh: new Map(),
      wrote: false,
      recording: false,
      sessions: new Map(),
      taken: [],
    }
    const ended = () => {
      for (const session of now.sessions.values()) session.close()
      writing = undefined
      held.statement('PRAGMA query_only = ON').run()
      if (steps) at.db.exec('PRAGMA foreign_keys = ON')
      if (toDisk) at.db.exec('PRAGMA synchronous = NORMAL')
    }
    const undo = () => {
      if (at.db.isTransaction) at.db.exec('ROLLBACK')
      // What the steps of this write made of the layout is undone with it.
      if (now.changedLayout) loadLayouts(at)
      ended()
    }
    try {
      held.statement('BEGIN IMMEDIATE').run()
      writing = now
      if (copying.keeping()) copying.record(now)
    } catch (error) {
      undo()
      throw failed(error, '')
    }
    return {
      tx: toDisk ? toDiskWrite(tx) : tx,
      undo,
      commit() {
        try {
          if (steps && at.db.prepare('PRAGMA foreign_key_check').get())
            throw new TentError('T2104', 'A table change would leave a link without its row.')
          held.statement('COMMIT').run()
          // What a table change made of the vector tables is read anew. Otherwise each copy that is built is told
          // the vectors this write set and removed.
          if (now.changedLayout) buildCopies(at)
          else
            for (const { table, column, n, vector } of now.vectors) {
              const copy = at.copies.get(copyKey(table, column))
              if (vector) copy?.set(n, vector)
              else copy?.remove(n)
            }
        } catch (error) {
          undo()
          throw failed(error, '')
        }
        ended()
        return { touched: [...now.touched].map(([table, set]) => ({ table, ids: [...set] })) }
      },
    }
  }

  const store: Store = {
    open(folder, o = {}) {
      if (open) throw new TentError('T0009', 'The store is already open.')
      // A store opens the one file it is handed: a tenant's file by its path, and `data.db` in a folder.
      const alone = folder === inMemory || isFile(folder)
      const file = alone ? folder : join(folder, 'data.db')
      const readOnly = o.readOnly === true
      if (readOnly && !existsSync(file)) throw new TentError('T0009', `No data file stands at ${file}.`)
      mkdirSync(dirname(file), { recursive: true })
      let db: DatabaseSync
      try {
        db = openSqlite(file)
      } catch (error) {
        // A file that is no data file fails at its first setting: nothing is left open on it.
        throw failed(error, '')
      }
      try {
        // Beside what every file of ours is set up with, the store holds links: https://sqlite.org/foreignkeys.html
        db.exec('PRAGMA foreign_keys = ON')
        // The tables kept in memory, and what SQLite keeps for itself while it works, stay in memory.
        db.exec('PRAGMA temp_store = MEMORY')
        // The cache of 64 MB is the shared file's. A tenant's file keeps SQLite's own, of 2 MB at most.
        if (!alone) db.exec(`PRAGMA cache_size = -${sharedCache / 1024}`)
        if (!readOnly && !hasMeta(db)) makeMeta(db)
        // Outside a write the connection is told to write nothing. A store that only reads is never told otherwise:
        // SQLite's own read-only opening would leave two files beside the file when it is the last to close it.
        db.exec('PRAGMA query_only = ON')
      } catch (error) {
        // What fails after the settings, as making the meta table, leaves nothing open either.
        db.close()
        throw failed(error, '')
      }
      open = {
        db,
        file,
        readOnly,
        layouts: new Map(),
        shapes: new Map(),
        statements: new Map(),
        raw: new Map(),
        copies: new Map(),
        lazy: o.lazy === true,
        noSearch: false,
        indexed: new Set(),
      }
      loadLayouts(open)
      buildCopies(open)
      keepPlace(store, { file, handed: folder, how: o, holds: (table) => opened().layouts.has(table), searchIndex })
      // Ids start above the largest id each table holds, so they grow across a restart too.
      for (const layout of open.layouts.values()) {
        if (layout.key) continue
        const last = db.prepare(`SELECT max("id") AS "id" FROM ${q(layout.name)}`).get()?.id
        if (typeof last === 'string') ids.above(last)
      }
    },

    optimize() {
      const at = opened()
      // SQLite's own optimiser, daily as at shutdown: https://sqlite.org/pragma.html#pragma_optimize
      if (at.readOnly || writing) return
      at.db.exec('PRAGMA query_only = OFF')
      try {
        at.db.exec('PRAGMA optimize')
      } finally {
        at.db.exec('PRAGMA query_only = ON')
      }
    },

    close() {
      const at = opened()
      forgetCompiled(at)
      if (!at.readOnly) {
        // SQLite's own optimiser, at shutdown: https://sqlite.org/pragma.html#pragma_optimize
        at.db.exec('PRAGMA query_only = OFF')
        at.db.exec('PRAGMA optimize')
      }
      at.db.close()
      open = undefined
      copying.stop()
    },

    read: (plan) => readPlan(held, plan),

    explain: (plan) => explainPlan(held, plan),

    write(fn, o = {}) {
      const open = begin(o)
      let value: ReturnType<typeof fn>
      try {
        value = fn(open.tx)
      } catch (error) {
        open.undo()
        // What the function itself threw is its own, and leaves as it is.
        throw sqliteFailed(error, '')
      }
      return { value, ...open.commit() }
    },

    begin,

    layout: () => structuredClone([...opened().layouts.values()]),

    applyTableChanges(steps) {
      const at = opened()
      if (!writing) throw new TentError('T0013', 'A table step stands outside a write.')
      // In a write that said it holds table steps they are the first act. What a file makes with a first row may follow a row.
      const late = steps.find((step) => !withARow.includes(step.do))
      if (writing.wrote && late)
        throw new TentError(
          'T0013',
          `The table step \`${late.do}\` of \`${late.table}\` stands after a row that the write wrote: the steps of a write are its first act.`,
        )
      writing.changedLayout = true
      forgetCompiled(at)
      // A table change is no part of a record: what the sessions hold is taken, and they are opened anew after
      // the steps have run and the layout they lead to is written down.
      const recording = writing.recording || writing.taken.length > 0 || copying.keeping()
      copying.take(writing)
      runSteps({ db: at.db, layouts: at.layouts, noSearch: at.noSearch }, steps, writing.steps)
      forgetCompiled(at)
      if (recording) copying.record(writing)
    },

    async snapshot(toFile) {
      // SQLite's own backup, from a connection of its own and in one step: it holds the file as it stood at one
      // commit while the writer goes on. https://sqlite.org/backup.html
      const source = new DatabaseSync(sqlitePath(opened().file))
      try {
        await backup(source, sqlitePath(toFile), { rate: 2 ** 31 - 1 })
      } catch (error) {
        throw failed(error, '')
      } finally {
        source.close()
      }
      const made = new DatabaseSync(sqlitePath(toFile))
      try {
        return { n: Number(hasMeta(made) ? (metaOf(made, 'n') ?? 0) : 0) }
      } finally {
        made.close()
      }
    },

    forget(table) {
      forgetCompiled(opened())
      buildCopies(opened(), table)
    },

    sql: (text, values) => raw(text, values, writing !== undefined),

    copy: copying.copy,

    changes: () => Number(opened().db.prepare('PRAGMA data_version').get()?.data_version),

    version() {
      const { db } = opened()
      // The layout is the one the file holds: a file that a newer store laid out says so, for the engine to refuse.
      const held = hasMeta(db) ? metaOf(db, 'shapeNumber') : undefined
      return {
        engine: String(db.prepare('SELECT sqlite_version() AS "v"').get()?.v),
        layout: typeof held === 'number' ? held : shapeNumber,
      }
    },
  }
  return store
}

/**
 * Whether what a store is handed to open is the path of one data file, and not the folder that holds `data.db`.
 * What stands on the disk says so. For what does not stand there yet, the file of a tenant is named by the id
 * of its tenant, and anything else is a folder, whatever its name ends in.
 */
function isFile(handed: string): boolean {
  const there = statSync(handed, { throwIfNoEntry: false })
  if (there) return there.isFile()
  const name = basename(handed)
  return name.endsWith('.db') && isId(name.slice(0, -3))
}

/** A value of a raw text as the runtime binds it: true and false as 1 and 0, a moment as its milliseconds. */
function bound(value: unknown): null | number | bigint | string | Uint8Array {
  if (value === undefined || value === null) return null
  if (typeof value === 'boolean') return value ? 1 : 0
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'string') return value
  return value instanceof Uint8Array ? value : JSON.stringify(value)
}
