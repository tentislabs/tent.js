import { heldIn } from './held.ts'
import { eachApart } from './eachApart.ts'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { TentError } from '../core/index.ts'
import { emptyFile } from './emptyFile.ts'
import type { FileName } from './fileName.ts'
import { fileKey, NotReady, notOneFile } from './fileName.ts'
import { tenantTable, inFiles, layoutFingerprint, makes, withLinked } from './fileLayout.ts'
import type { Files, FilesOptions, Writing } from './files.ts'
import type { Frame, Inside } from './filesInside.ts'
import { keepInside } from './filesInside.ts'
import { setMeta } from './here.ts'
import { holdTo, letGo } from './holdSteps.ts'
import { isTenant } from './isTenant.ts'
import { keptOut } from './keptOut.ts'
import { isId } from './ids.ts'
import { countingVersions, heldMeta, holdsIn, isChecked, standingCheck, toldCount } from './metaKeys.ts'
import { noRows } from './noRows.ts'
import { nothingNoted, watching } from './noted.ts'
import { placeOf, sameStore } from './place.ts'
import { standingFiles } from './standingFiles.ts'
import type { By, Store, TableLayout, TableStep, Tx } from './store.ts'
import { changesTable, hereTable, historyTable } from './tables.ts'
import { walkedOn } from './walk.ts'

const system = { kind: 'system' } as const

/** One file of a tenant that is open. */
interface Entry {
  file: FileName
  // The store of the file, with nothing around it, and the store that is handed out.
  store: Store
  around: Store
  // The engine was told that the file is written: before it was made, or before its first write since it was opened.
  marked: boolean
  // Whoever counts the writes has learned the file's own count.
  counted: boolean
}

// The values of `_t_meta` that `data` writes for itself: no caller touched them.
const bookkeeping = ['n', 'epoch', 'writer', 'table', 'tenant', 'fingerprint', 'swept']

const noTenant = (file: FileName): TentError =>
  new TentError(
    'T2104',
    `\`${file.table}\` holds no row under the id ${JSON.stringify(file.id).slice(0, 64)}: it names no tenant.`,
  )

/**
 * Takes the data folder of an app, the layout of its tables, and what makes a store. Opens the shared file, and
 * answers the files of the app. The file of a tenant lies at `tenants/<table>/<the last two characters of the
 * id>/<id>.db`: it is made with its first write, and a table inside it with its first row. A write is held to one
 * file, the one it first writes to: a second file is T2109, and undoes the write.
 */
export function openFiles(folder: string, layout: TableLayout[], o: FilesOptions): Files {
  const shared = o.store()
  shared.open(folder)
  const open = new Map<string, Entry>()
  const frames: Frame[] = []
  const deferred: (() => void)[] = []
  // The tables of this machine alone, and the tables of the engine that a file may come to hold.
  const own = new Set([hereTable.name, changesTable.name, ...layout.filter((one) => one.own).map((one) => one.name)])
  const engine = [historyTable, hereTable, ...layout.filter((one) => one.name.startsWith('_t_') && !one.own)]
  let running: TableLayout[] = []
  let tenants = new Set<string>()
  // The tables that a file of each tenant table may hold, as a file keeps them, by their names.
  const tablesBy = new Map<string, Map<string, TableLayout>>()
  // The folder of each table of tenants, where it is not the name the table has now.
  let folders: Record<string, string> = {}

  const told = (to: TableLayout[]) => {
    running = to.filter((one) => !one.name.startsWith('_t_'))
    tenants = new Set(running.flatMap((one) => tenantTable(one) ?? []))
    tablesBy.clear()
    for (const table of tenants)
      tablesBy.set(
        table,
        new Map(
          [...engine, ...inFiles(running).filter((one) => tenantTable(one) === table)].map((one) => [one.name, one]),
        ),
      )
  }
  told(layout)
  const kept = heldMeta(shared, 'tenantFolders')
  if (typeof kept === 'object' && kept !== null)
    folders = Object.fromEntries(Object.entries(kept).map(([table, name]) => [table, String(name)]))

  const names = (file: FileName): boolean => tenants.has(file.table) && isId(file.id)
  const pathOf = (file: FileName): string =>
    join(folder, 'tenants', folders[file.table] ?? file.table, file.id.slice(-2), `${file.id}.db`)
  /** Whether the file of a tenant holds a table: a table is made with its first row. */
  const has = (entry: Entry, table: string): boolean => {
    const place = placeOf(entry.store)
    return place?.holds ? place.holds(table) : entry.store.layout().some((one) => one.name === table)
  }
  const frameOf = (file: FileName | undefined): Frame | undefined =>
    frames.find((one) => one.key === fileKey(file) && one.open !== undefined)
  /** Whether this machine is a reader: it writes no file of its own accord. */
  const isReader = (): boolean =>
    shared.layout().some((one) => one.name === hereTable.name) &&
    heldIn(shared.read({ from: hereTable.name, one: 'get', id: 'role' }, system).value, 'value') === 'reader'

  /** Carries table steps out in the write of one file that is under way, and notes them. */
  const stepsIn = (frame: Frame, steps: TableStep[]) => {
    frame.store?.applyTableChanges(steps)
    frame.noted.steps.push(...steps.filter((step) => !own.has(step.table)))
    frame.noted.stepped = true
    frame.noted.counts = true
  }

  /** The store of the shared file, or of one tenant's, as it is handed out: its writes are writes of the files. */
  const aroundOf = (plain: Store, entry?: Entry): Store => {
    const file = entry?.file
    const around: Store = {
      ...plain,
      open(where, how) {
        if (file) throw new TentError('T0013', 'The file of a tenant is opened by the files of its app.')
        plain.open(where, how)
        inside.counting?.reopened()
      },
      close() {
        if (file) return files.close(file)
        inside.counting?.stopped()
        plain.close()
      },
      read: (plan, caller) =>
        entry && !has(entry, plan.from) ? { value: noRows(plan), tables: [plan.from] } : plain.read(plan, caller),
      write(fn, how) {
        const answer = files.write((w) => fn(w.tx(file)), how)
        return { value: answer.value, touched: answer.touched.map(({ table, ids }) => ({ table, ids })) }
      },
      applyTableChanges(steps) {
        const frame = frameOf(file)
        if (!frame) throw new TentError('T0013', 'A table step stands outside a write.')
        stepsIn(frame, steps)
      },
      // A write of the files is one write of `files.write`, which begins it at its first row.
      begin: undefined,
    }
    sameStore(around, plain)
    return around
  }

  /** Lets go of the holds of a file that count for nothing any more, in a write of that file. */
  const settle = (entry: Entry) => {
    const holds = holdsIn(entry.store)
    if (!holds.length) return
    const counting = countingVersions(shared)
    if (holds.every((hold) => counting.includes(hold.version)) || isReader()) return
    files.write(
      (w) =>
        letGo(
          w.tx(entry.file),
          (steps) => entry.around.applyTableChanges(steps),
          (hold) => !counting.includes(hold.version),
        ),
      { steps: true },
    )
  }

  /** Tells whoever counts the writes of a file's own count, once, before the first write of it takes a number. */
  const counted = (entry: Entry) => {
    if (entry.counted) return
    entry.counted = true
    inside.counting?.opened(entry.file, entry.store)
  }

  /** The file of one tenant that is open, opened where it is closed, and made with `make`. */
  const entryOf = (file: FileName, how: { make?: boolean } = {}): Entry | undefined => {
    if (!names(file)) return undefined
    const key = fileKey(file)
    const already = open.get(key)
    if (already) return already
    const path = pathOf(file)
    const there = existsSync(path)
    if (!there) {
      // A tenant whose row is not in the shared file has no file, and none is made for one.
      if (!how.make || !isTenant(shared, file)) return undefined
      o.writing?.(file)
      mkdirSync(dirname(path), { recursive: true })
    }
    const store = o.store()
    // What a file keeps in memory is built at its first use, and dropped when it closes.
    store.open(path, { lazy: true })
    if (inside.keeping) store.copy?.keep()
    const entry: Entry = { file, store, around: store, marked: !there, counted: false }
    entry.around = aroundOf(store, entry)
    open.set(key, entry)
    try {
      // A file that lies at the place of another is refused before its count, its holds or anyone else reads it.
      if (there && o.before?.(file, entry.around) === 'wait') throw new NotReady(file)
      counted(entry)
      if (there) settle(entry)
      o.opened?.(file)
    } catch (error) {
      open.delete(key)
      store.close()
      throw error
    }
    return entry
  }

  /** What a file writes of itself with its first write: its table and its tenant, the layout it stands at, and the count it stands at. */
  const first = (frame: Frame, entry: Entry, tx: Tx) => {
    if (heldMeta(tx, 'tenant') !== undefined) return
    if (!has(entry, hereTable.name)) stepsIn(frame, [makes(hereTable)])
    setMeta(tx, 'table', entry.file.table)
    setMeta(tx, 'tenant', entry.file.id)
    setMeta(tx, 'fingerprint', layoutFingerprint(running, entry.file.table))
    // The rows of a file that the version makes are written by it: no backfill of the version walks them.
    for (const one of running)
      if (tenantTable(one) === entry.file.table) for (const name of one.walks ?? []) walkedOn(tx, name, undefined, true)
    setMeta(tx, 'swept', toldCount(shared))
    frame.noted.counts = true
  }

  /** Makes a table in a file with its first row, with the tables its links name, and with the holds of a check that stands. */
  const make = (frame: Frame, entry: Entry, tx: Tx, table: string) => {
    const tables = tablesBy.get(entry.file.table) ?? new Map<string, TableLayout>()
    if (!tables.has(table))
      throw notOneFile(
        `\`${table}\` does not live in the file of a row of \`${entry.file.table}\``,
        'Write a table of the shared file in a change of its own.',
      )
    const made = withLinked(tables, table)
      .filter((one) => !has(entry, one.name))
      .reverse()
    stepsIn(frame, made.map(makes))
    const check = standingCheck(shared)
    if (!check) return
    const steps = check.steps.filter((step) =>
      isChecked(
        step,
        made.find((one) => one.name === step.table),
      ),
    )
    holdTo(
      tx,
      (indexes) => stepsIn(frame, indexes),
      check.version,
      steps.filter((step) => made.some((one) => one.name === step.table)),
      tables,
    )
  }

  /** The tables of the app that a file of one table of tenants may hold, as a file keeps them. */
  const appTables = (table: string): TableLayout[] =>
    [...(tablesBy.get(table)?.values() ?? [])].filter((one) => !one.name.startsWith('_t_'))

  /**
   * Makes every table of its layout that a file lacks: in the write of that file where one is under way, and
   * otherwise in a write of its own, which a reader leaves to the writer.
   */
  const whole = (entry: Entry) => {
    const lacks = () => appTables(entry.file.table).filter((one) => !has(entry, one.name))
    if (!lacks().length) return
    const makeAll = (frame: Frame | undefined) => {
      if (frame?.open) for (const one of lacks()) make(frame, entry, frame.open.tx, one.name)
    }
    if (frameOf(entry.file)) return makeAll(frameOf(entry.file))
    if (isReader()) throw new NotReady(entry.file)
    files.write((w) => {
      w.tx(entry.file)
      makeAll(frameOf(entry.file))
    })
  }

  /** The write of one tenant's file: a table is made with its first row, and one that the file does not hold answers no rows. */
  const fileTx = (frame: Frame, entry: Entry, tx: Tx): Tx => ({
    ...tx,
    read: (plan, caller) => (has(entry, plan.from) ? tx.read(plan, caller) : noRows(plan)),
    add(table, values, caller) {
      if (!has(entry, table)) make(frame, entry, tx, table)
      return tx.add(table, values, caller)
    },
    change(table, id, values, caller) {
      if (!has(entry, table))
        throw new TentError('T2103', `No row of \`${table}\` is found under ${JSON.stringify(id)}.`)
      return tx.change(table, id, values, caller)
    },
    remove(table, id, caller) {
      if (!has(entry, table))
        throw new TentError('T2103', `No row of \`${table}\` is found under ${JSON.stringify(id)}.`)
      tx.remove(table, id, caller)
    },
    sql: (text, values, touches) => tx.sql(text, values, touches),
  })

  /** The write of a frame: opened at its first asking, for the file it is asked for, and held to that file. */
  const txOf = (frame: Frame, file: FileName | undefined): Tx => {
    const key = fileKey(file)
    if (frame.key !== undefined) {
      if (frame.key === key && frame.tx) return frame.tx
      frame.failed = notOneFile(
        'a write that wrote one file writes a second',
        'Write each file in a change of its own: an action or a flow calls a change for each.',
      )
      throw frame.failed
    }
    if (frames.some((one) => one !== frame && one.key === key))
      throw new TentError('T0013', 'A write was begun inside a write of the same file.')
    const entry = file ? entryOf(file, { make: true }) : undefined
    if (file && !entry) throw noTenant(file)
    // A write that `before` makes while the file opens, as its sweep, takes a number above the file's own.
    if (entry) counted(entry)
    if (file && entry && !entry.marked) {
      o.writing?.(file)
      entry.marked = true
    }
    const store = entry ? entry.store : shared
    if (!store.begin)
      throw new TentError('T0013', 'The store of the files of tenants cannot begin a write that is ended later.', {
        fix: 'Keep the files of tenants in a store that offers `begin`, as the store of the runtime does.',
      })
    const opened = store.begin({ steps: frame.steps, ...(frame.toDisk ? { toDisk: true } : {}) })
    Object.assign(frame, { key, file, store, open: opened })
    const inner = entry ? fileTx(frame, entry, opened.tx) : opened.tx
    const counting = inside.counting
    frame.tx = counting
      ? watching(inner, frame.noted, counting.own, counting.readsRemoved, counting.vectors, counting.readsBefore)
      : inner
    if (entry) first(frame, entry, opened.tx)
    return frame.tx
  }

  const runDeferred = () => {
    while (!frames.length && deferred.length) deferred.shift()?.()
  }

  const files: Files = {
    shared,

    of: (file, how) => entryOf(file, how)?.around,

    write<T>(fn: (w: Writing) => T, how: { steps?: boolean; toDisk?: boolean; by?: By } = {}) {
      const frame: Frame = { steps: how.steps === true, toDisk: how.toDisk === true, noted: nothingNoted() }
      if (how.by) frame.noted.by = how.by
      frames.push(frame)
      /** The write was undone: whoever counts is told. */
      const undone = () => {
        frames.splice(frames.indexOf(frame), 1)
        if (frame.open) inside.counting?.undone(frame)
        runDeferred()
      }
      let value: T
      let touched: { table: string; ids: string[] }[] = []
      try {
        value = fn({ files, tx: (file) => txOf(frame, file) })
        if (frame.failed) throw frame.failed
        if (frame.open) inside.counting?.ending(frame)
      } catch (error) {
        // A write whose undo fails is let go all the same, so the writes after it are not refused.
        eachApart([() => frame.open?.undo(error), undone])
        throw error
      }
      try {
        // A commit that fails has undone the write itself.
        if (frame.open) touched = frame.open.commit().touched
      } catch (error) {
        undone()
        throw error
      }
      frames.splice(frames.indexOf(frame), 1)
      eachApart([
        () => {
          if (frame.open) inside.counting?.committed(frame)
        },
        runDeferred,
      ])
      const file = frame.file
      const mine = keptOut(touched)
        .map((one) =>
          one.table === '_t_meta' ? { ...one, ids: one.ids.filter((id) => !bookkeeping.includes(id)) } : one,
        )
        .filter((one) => one.table !== '_t_meta' || one.ids.length)
      return { value, touched: mine.map((one) => (file ? { ...one, file } : one)), ...(file ? { file } : {}) }
    },

    path(file) {
      if (!names(file)) throw noTenant(file)
      return pathOf(file)
    },

    open: () => [...open.values()].map((entry) => entry.file),

    close(file) {
      const key = fileKey(file)
      const entry = open.get(key)
      if (!entry) return
      if (frames.some((one) => one.key === key))
        throw new TentError('T0013', 'A file is closed while a write of it is under way.')
      entry.store.close()
      open.delete(key)
    },

    has: (file) => names(file) && existsSync(pathOf(file)),

    remove(file) {
      if (!names(file)) return
      files.close(file)
      for (const ending of ['', '-wal', '-shm']) rmSync(`${pathOf(file)}${ending}`, { force: true })
    },

    layout(to) {
      const before = tenants
      const was = new Map(running.map((one) => [one.name, one]))
      told(to)
      const next = { ...folders }
      // A table of tenants keeps its folder under a new name: a rename moves no file.
      for (const table of tenants) {
        const stated = to.find((one) => one.name === table)?.was ?? []
        const from = before.has(table) ? undefined : stated.find((name) => before.has(name) && was.has(name))
        if (from === undefined) continue
        next[table] = folders[from] ?? from
        Reflect.deleteProperty(next, from)
      }
      const tenanted = running.filter((one) => tenantTable(one) !== undefined)
      const same = isDeepStrictEqual(heldMeta(shared, 'tenantLayout'), JSON.parse(JSON.stringify(tenanted)))
      folders = next
      if ((same && isDeepStrictEqual(next, heldMeta(shared, 'tenantFolders') ?? {})) || isReader()) return
      // In the write of the switch where one is under way, and in a write of its own otherwise.
      const frame = frameOf(undefined)
      const keep = (tx: Tx) => {
        setMeta(tx, 'tenantLayout', tenanted)
        setMeta(tx, 'tenantFolders', Object.keys(next).length ? next : undefined)
      }
      if (frame?.tx) keep(frame.tx)
      else files.write((w) => keep(w.tx()))
    },

    walk: () =>
      standingFiles(
        folder,
        [...tenants].map((table) => [table, folders[table] ?? table]),
      ),
  }

  const inside: Inside = {
    shared,
    frames,
    keeping: false,
    layouts: () => running,
    tenants: () => [...tenants],
    plain: (file, how) => entryOf(file, how)?.store,
    holds(file, table) {
      const entry = entryOf(file)
      return entry !== undefined && has(entry, table)
    },
    heldTo(file, table) {
      const entry = entryOf(file)
      const made = entry !== undefined && has(entry, table)
      // A table that is made by this write takes the holds of a check that stands, its first row with them.
      if (!made) {
        const layout = tablesBy.get(file.table)?.get(table)
        return (standingCheck(shared)?.steps ?? []).filter((step) => step.table === table && isChecked(step, layout))
      }
      const holds = entry ? holdsIn(entry.store).filter((hold) => hold.step.table === table) : []
      if (!holds.length) return []
      const counting = countingVersions(shared)
      return holds.filter((hold) => counting.includes(hold.version)).map((hold) => hold.step)
    },
    alone(file, read) {
      const entry = open.get(fileKey(file))
      if (entry) return read(entry.around)
      const store = o.store()
      store.open(pathOf(file), { readOnly: true, lazy: true })
      try {
        return read(store)
      } finally {
        store.close()
      }
    },
    raw(file, run, how) {
      const entry = how === 'empty' ? undefined : entryOf(file)
      if (!entry) return emptyFile(o.store(), appTables(file.table), run)
      if (how !== 'asItIs') whole(entry)
      return run(entry.around)
    },
    snapshot(file, toFile) {
      const entry = open.get(fileKey(file))
      if (entry) return entry.store.snapshot(toFile)
      const store = o.store()
      store.open(pathOf(file), { readOnly: true, lazy: true })
      return store.snapshot(toFile).finally(() => store.close())
    },
    later(run) {
      if (frames.length) deferred.push(run)
      else run()
    },
    keepOpen() {
      for (const entry of open.values()) entry.store.copy?.keep()
    },
  }
  files.shared = aroundOf(shared)
  keepInside(files, inside)
  return files
}
