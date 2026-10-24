import type { Caller, Db } from '../core/index.ts'
import { TentError } from '../core/index.ts'
import type { Description, Plan } from '../core/internal.ts'
import { answered } from './answered.ts'
import type { DbContext, DbOptions } from './context.ts'
import { hiddenOf, unnamed } from './columnRules.ts'
import { begin } from './context.ts'
import { keptAnew } from './counting.ts'
import type { FileName } from './fileName.ts'
import { fileKey } from './fileName.ts'
import type { Files, Writing } from './files.ts'
import { insideOf } from './filesInside.ts'
import { isTenant } from './isTenant.ts'
import { isId } from './ids.ts'
import { raiseRemovals } from './metaKeys.ts'
import { linkedFromFiles, tableNames, tableOf as modelOf } from './model.ts'
import { noRows } from './noRows.ts'
import { carried, rulingOf } from './reads.ts'
import type { RuleCode } from './rules.ts'
import { ruleResolve } from './rules.ts'
import type { Row, Store, Tx } from './store.ts'
import type { Resolve } from './worked.ts'
import { workedValue } from './worked.ts'
import { addRow, changeRow, removeRow } from './writes.ts'
import { dbFace } from './dbFace.ts'

/** A write as it is stored: one row added, changed or removed. */
type StoredWrite =
  | { add: string; of?: unknown; values: Record<string, unknown> }
  | { change: string; of?: unknown; id: unknown; values: Record<string, unknown> }
  | { remove: string; of?: unknown; id: unknown }

/** Carries a stored plan out, as one read that the options of the db are told of. */
const readOf = (cx: DbContext, plan: Plan, resolve?: Resolve): unknown =>
  cx.o.traced
    ? cx.o.traced({ kind: 'query', table: plan.from }, () => carried(cx, plan, resolve))
    : carried(cx, plan, resolve)

/** Carries one write of a row out, as one write that the options of the db are told of. */
const wroteOf = <Answer>(
  cx: DbContext,
  table: string,
  write: 'add' | 'change' | 'remove',
  work: () => Answer,
): Answer => (cx.o.traced ? cx.o.traced({ kind: 'write', table, write }, work) : work())

/** One write of a row, with its values, its id and its tenant worked out. */
function rowWrite(cx: DbContext, write: StoredWrite, values: Row, id: string, of: unknown): unknown {
  if ('add' in write) return wroteOf(cx, write.add, 'add', () => addRow(cx, write.add, values, of))
  return 'change' in write
    ? wroteOf(cx, write.change, 'change', () => changeRow(cx, write.change, id, values, of))
    : wroteOf(cx, write.remove, 'remove', () => removeRow(cx, write.remove, id, of))
}

/** What carries a stored plan and stored writes out, for the program that holds a `db`: each value worked out by `resolve`. */
function carriesOf(cx: DbContext): Record<string, unknown> {
  return {
    // A read of a `db` of an action, a route or a step answers a promise.
    read: (plan: Plan, resolve?: Resolve) => answered(cx.mode === 'async', () => readOf(cx, plan, resolve)),
    write: (writes: StoredWrite[], resolve: Resolve = ruleResolve(cx.caller)) =>
      writes.map((write) => {
        const values: Row = {}
        if ('values' in write)
          for (const [name, stored] of Object.entries(write.values)) values[name] = workedValue(stored, resolve)
        const of = write.of === undefined ? undefined : workedValue(write.of, resolve)
        return rowWrite(cx, write, values, 'id' in write ? String(workedValue(write.id, resolve)) : '', of)
      }),
  }
}

/** What a `db` is made over: one store or the write of one, or the files of an app or one write of them. */
type Source = Store | Tx | Files | Writing

/**
 * Answers what reads a plan for a `db`. Over one store, or the write of one, every plan is read there. Over the
 * files of an app a table of the shared file is read in the shared file, and everything else - a tenant table,
 * the history of its rows - in the file of the tenant that the `db` is at work in. A file whose
 * tenant has no row in the shared file is read for nobody: it answers no rows, and is not opened.
 */
function readerOf(source: Source, description: Description, caller: Caller): (cx: DbContext, plan: Plan) => unknown {
  if ('shared' in source || 'files' in source) {
    const files = 'shared' in source ? source : source.files
    return (cx, { of: _, ...plan }) => {
      const shared = Object.hasOwn(description.tables, plan.from) && !modelOf(description, plan.from).tenantTable
      if (shared || !cx.at) return files.shared.read(plan, caller).value
      const store = isTenant(files.shared, cx.at) ? files.of(cx.at) : undefined
      return store ? store.read(plan, caller).value : noRows(plan)
    }
  }
  return 'write' in source ? (_, plan) => source.read(plan, caller).value : (_, plan) => source.read(plan, caller)
}

/** Answers the file of the tenant that an id names: the id of a row is its own in the whole app. */
function fileNamed(files: Files, id: unknown): FileName | undefined {
  if (!isId(id)) return undefined
  const table = insideOf(files)
    .tenants()
    .find((one) => isTenant(files.shared, { table: one, id }))
  return table === undefined ? undefined : { table, id }
}

/**
 * Takes a store or the write of one, or the files of an app or one write of them, the description, the caller,
 * the mode, the `where` rules that are code, and the options. Answers the `db` of that caller: already limited to
 * what the caller may see and change, by the table rules. In the mode `read` every call answers at once and what
 * it hands out is frozen; in `write` it also writes, through the `Tx`; in `async` it reads only, and every answer
 * is a promise. With `system` it also has `db.system`, `db.sql` and `db.n`, and for a caller that is the system it
 * is not limited itself. Over the files of an app, a plan and a write on a tenant table begin with
 * `of(tenant)`, and work in the file of that tenant.
 */
export function createDb(
  source: Store | Tx | Files | Writing,
  description: Description,
  caller: Caller,
  mode: 'read' | 'write' | 'async',
  rules: Record<string, RuleCode>,
  o?: DbOptions,
): Db
export function createDb(
  source: Source,
  description: Description,
  caller: Caller,
  mode: 'read' | 'write' | 'async',
  rules: Record<string, RuleCode>,
  o: DbOptions = {},
): object {
  const now = o.now ?? Date.now
  const files = 'shared' in source ? source : 'files' in source ? source.files : undefined
  // What a raw text outside a write is read through: the shared file of an app, or the one store.
  const store: Store | undefined =
    'shared' in source
      ? source.shared
      : 'files' in source
        ? source.files.shared
        : 'write' in source
          ? source
          : undefined
  // The write of this db: of the files of an app the write of one file, which its first asking opens.
  const write: DbContext['write'] =
    'files' in source ? (file) => source.tx(file) : 'shared' in source || 'write' in source ? undefined : () => source
  const reads = readerOf(source, description, caller)
  const started = now()
  // The view of the caller itself, by which a row that full access read is held again where it leaves.
  let limited: DbContext | undefined
  const context = (full: boolean): DbContext => {
    const cx: DbContext = {
      description,
      caller,
      mode,
      rules,
      o,
      full,
      freeze: mode === 'read',
      read: (plan) => reads(cx, plan),
      ...(write && mode === 'write' ? { write } : {}),
      ...(files ? { files } : {}),
      now,
      ...(o.limits?.time === undefined ? {} : { deadline: started + o.limits.time }),
      depth: 0,
      hidden: (model) => hiddenOf(cx, model, () => rulingOf(cx)),
      // The system is held to no rule of a column; any other caller to every rule, wherever its row was read.
      leaving: (model) => {
        if (caller.kind === 'system') return []
        limited ??= context(false)
        return unnamed(limited.hidden?.(model) ?? { never: [], byRow: new Map() })
      },
    }
    return cx
  }
  const all = context(true)

  /**
   * Raw SQL of one tenant's file, which sees every table of the layout of that file: through the write of that
   * file where it is open, and through its store otherwise. For a tenant with no file a text that reads runs
   * against an empty file in memory, inside a change as outside one, and one that writes makes the file.
   */
  const sqlOf = (text: string, values: unknown[], of: string): unknown[] => {
    const file = files ? fileNamed(files, of) : undefined
    if (!files || !file)
      throw new TentError(
        'T2104',
        `Raw SQL names the tenant ${JSON.stringify(of).slice(0, 64)}, and no tenant has that id.`,
      )
    const inside = insideOf(files)
    const reads = (how?: 'asItIs' | 'empty') =>
      inside.raw(
        file,
        (held) => {
          if (!held.sql) throw new TentError('T0013', 'Raw SQL was used on a store that has none.')
          return held.sql(text, values)
        },
        how,
      )
    const opens = all.write
    if (!opens) return reads()
    const writes = () => {
      const tx = opens(file)
      const answer = inside.raw(file, () => tx.sql(text, values, o.touches))
      keptAfterRaw(tx)
      return answer
    }
    if (isOpen(file)) return writes()
    // The file is met as it stands first, so that a text which writes makes no table in a file it may not write.
    // What fails there may name a table that the file lacks: an empty file of the layout then says whether the
    // text writes, and one that reads is read once the missing tables are made, in a write of their own.
    return readFirst(() => {
      try {
        return reads('asItIs')
      } catch (error) {
        if (error instanceof TentError && error.code === 'T0012') throw error
        try {
          reads('empty')
        } catch (again) {
          throw again instanceof TentError && again.code === 'T0012' ? again : error
        }
        return reads()
      }
    }, writes)
  }

  /**
   * A raw text writes rows that no write of `db` names: every kept column that counts a table it may have touched
   * is worked out anew, over every row, in the same write.
   */
  const keptAfterRaw = (tx: Tx): void => {
    const touched = (table: string): boolean => o.touches === undefined || o.touches.includes(table)
    const kept = tableNames(description).flatMap((name) => (touched(name) ? modelOf(description, name).counted : []))
    for (const done of keptAnew(tx, kept)) o.wrote?.(done)
  }

  /** Whether the write of a file of the app is open: of the shared file where none is named. */
  const isOpen = (file?: FileName): boolean =>
    files !== undefined && insideOf(files).frames.some((one) => one.tx !== undefined && one.key === fileKey(file))

  /**
   * Runs a raw text of a change for a file whose write is not open. A change reads any file, and only a text that
   * writes opens the write of its file, and makes the file of a tenant with none. So the text is tried where
   * nothing can be written: the store refuses one that writes before it runs (T0012), and that one opens the write.
   */
  const readFirst = (read: () => unknown[], writes: () => unknown[]): unknown[] => {
    try {
      return read()
    } catch (error) {
      if (!(error instanceof TentError && error.code === 'T0012')) throw error
    }
    return writes()
  }

  /** Raw SQL: full access, which passes no table rule and sees every table of the app as it is stored. */
  const sql = (text: string, values: unknown[] = [], how: { of?: string } = {}): unknown[] => {
    begin(all)
    if (how.of !== undefined) return sqlOf(text, values, how.of)
    const opens = all.write
    if (opens) {
      const writes = () => {
        const tx = opens()
        // A raw text that may have removed a row which a file links to counts as a removal: its rows are not known.
        const far = linkedFromFiles(description)
        if (far.size && (o.touches === undefined || o.touches.some((table) => far.has(table)))) raiseRemovals(tx)
        const answer = tx.sql(text, values, o.touches)
        keptAfterRaw(tx)
        return answer
      }
      const outside = files && !isOpen() ? store?.sql : undefined
      return outside ? readFirst(() => outside(text, values), writes) : writes()
    }
    // A `db` that only reads, made over a write, runs a text that may only read.
    const raw = store?.sql ?? (write ? (asked: string, given: unknown[]) => write().sqlRead(asked, given) : undefined)
    if (!raw) throw new TentError('T0013', 'Raw SQL was used on a store that has none.')
    return raw(text, values)
  }

  // The view of the caller itself: the system is not limited, any other caller by the rules of the tables.
  const own = caller.kind === 'system' ? all : context(false)
  const face = dbFace(
    {
      read: (plan, full) => readOf(full ? all : own, plan),
      write: (writes, full) =>
        writes.map((write) => {
          const of = write.of === undefined ? undefined : workedValue(write.of, ruleResolve(caller))
          const values = 'values' in write ? write.values : {}
          return rowWrite(full ? all : own, write, values, 'id' in write ? String(write.id) : '', of)
        }),
      sql: (text, values, how) => sql(text, values, how),
    },
    { tables: tableNames(description), mode, full: o.system === true },
  )
  Object.assign(face, carriesOf(own))
  if (o.system) Object.assign(Object(face.system), carriesOf(all))
  return face
}
