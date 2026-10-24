import { TentError } from '../core/index.ts'
import type { Change } from './changes.ts'
import type { SinkChange } from './sink.ts'
import { forgetKept, keepChange, sinkSize as kept } from './changes.ts'
import { makes } from './fileLayout.ts'
import type { FileName } from './fileName.ts'
import type { Files } from './files.ts'
import { insideOf } from './filesInside.ts'
import { firstSum, hereIn, nextSum, setHere } from './here.ts'
import { heldMeta } from './metaKeys.ts'
import { plainOf } from './place.ts'
import type { Store } from './store.ts'
import { changesTable, hereTable } from './tables.ts'

const system = { kind: 'system' } as const

const clash = (why: string): TentError =>
  new TentError('T0033', `A change does not fit the store it is applied to: ${why}.`, {
    fix: 'Move the data file aside and fetch the data anew from the writer.',
  })

const wrongTenant = (file: FileName, named: unknown): TentError =>
  new TentError(
    'T0009',
    `A change of the data file of ${file.table} ${file.id} makes a file that names ${JSON.stringify(named)} as its tenant: a file holds its table and its tenant.`,
  )

const copyOf = (store: Store): NonNullable<Store['copy']> => {
  if (!store.copy)
    throw new TentError('T0013', 'A change is applied to a store that can be copied, and this store has no `copy`.')
  return store.copy
}

/** Puts a change into one store, in one write: the table steps, then the record with the rows of the change, and with `keep` its kept change. */
function applyTo(store: Store, change: Change, keep: Store | undefined): void {
  const copy = copyOf(store)
  try {
    store.write(
      (tx) => {
        if (change.layout) store.applyTableChanges(change.layout.steps)
        const sum = nextSum(String(hereIn(tx).sum ?? firstSum), change.record)
        if (sum !== change.sum) throw clash('its running fingerprint is another than the one this store works out')
        copy.apply(change.record, change.rows)
        // The file that a change makes names its tenant as its own: under the name of another it is not applied.
        const named = change.file ? heldMeta(tx, 'tenant') : undefined
        if (change.file && named !== undefined && named !== change.file.id) throw wrongTenant(change.file, named)
        setHere(tx, { sum })
        if (keep) keepChange(keep, tx, change, kept, Date.now())
      },
      { steps: change.layout !== undefined },
    )
  } catch (error) {
    if (keep) forgetKept(keep)
    throw error
  }
  for (const table of change.tables ?? []) store.forget(table)
}

// How many changes one write of `applyChanges` puts in at most.
const batch = 500

/** Puts the records of changes into one store, many to a write: a change with table steps in a write of its own. */
function recordsInto(store: Store, changes: SinkChange[]): void {
  const copy = copyOf(store)
  for (let at = 0; at < changes.length; ) {
    const first = changes[at]
    if (first.layout?.length) {
      const steps = first.layout
      store.write(
        () => {
          store.applyTableChanges(steps)
          copy.apply(first.record ?? new Uint8Array(), first.rows)
        },
        { steps: true },
      )
      for (const table of first.tables ?? []) store.forget(table)
      at++
      continue
    }
    const run: SinkChange[] = []
    while (at < changes.length && !changes[at].layout?.length && run.length < batch) run.push(changes[at++])
    store.write(() => {
      for (const change of run) copy.apply(change.record ?? new Uint8Array(), change.rows)
    })
    for (const change of run) for (const table of change.tables ?? []) store.forget(table)
  }
}

/**
 * Takes a store, or the files of an app, and changes of it in order, as a sink that records was handed them: the
 * records of an archive. Puts them in as the writes they were, with no running fingerprint, which is the readers'
 * alone: a change of a tenant's file into that file, which it makes where it is not there, and a change whose
 * number the file already holds skipped; a tenant that a change removed is gone with its file. For a copy that is
 * made from a backup, where one commit to the disk for each change is what costs, many go to a write. Throws
 * T0033 where a row is not as a record expects it, and a write that fails holds nothing of its changes.
 */
export function applyChanges(on: Store | Files, changes: SinkChange[]): void {
  if (!('shared' in on)) {
    recordsInto(on, changes)
    return
  }
  const inside = insideOf(on)
  let shared: SinkChange[] = []
  const flush = (): void => {
    recordsInto(on.shared, shared)
    shared = []
  }
  for (const change of changes) {
    if (!change.file) {
      shared.push(change)
      if (change.gone?.length) {
        flush()
        for (const gone of change.gone) on.remove(gone)
      }
      continue
    }
    flush()
    const store = inside.plain(change.file, { make: true })
    if (store && Number(heldMeta(plainOf(store), 'n') ?? 0) < change.n) recordsInto(plainOf(store), [change])
  }
  flush()
}

/** Keeps a change in a shared file, in a write of its own, where that file does not keep one of that number yet. */
function keepIn(shared: Store, change: Change): void {
  if (shared.read({ from: changesTable.name, one: 'get', id: change.n }, system).value !== undefined) return
  try {
    shared.write((tx) => keepChange(shared, tx, change, kept, Date.now()))
  } catch (error) {
    forgetKept(shared)
    throw error
  }
}

/**
 * Makes the write of one tenant's file that a change is of, with the store of that file. A change whose number
 * is not above the number its file already holds is skipped. The file keeps its running fingerprint in a table of
 * its own, which no record covers: it is made here where the file does not hold it.
 */
function applyToFile(file: Store, change: Change): void {
  const store = plainOf(file)
  if (Number(heldMeta(store, 'n') ?? 0) >= change.n) return
  if (!store.layout().some((one) => one.name === hereTable.name))
    store.write(() => store.applyTableChanges([makes(hereTable)]))
  applyTo(store, change, undefined)
}

/** Puts a change into the files of an app: the write of the file it names, and then its kept change in the shared file. */
function applyToFiles(files: Files, change: Change, only: 'kept' | 'file' | undefined): void {
  const inside = insideOf(files)
  if (only === 'kept') {
    // A writer keeps the change that a file thread answered where its changes are kept, and hands it on.
    if (!inside.counting || inside.told) keepIn(files.shared, change)
    inside.counting?.handOn(change)
    return
  }
  if (!change.file) {
    applyTo(files.shared, change, only === 'file' ? undefined : files.shared)
    // Each tenant that the write removed is gone with its file.
    for (const gone of change.gone ?? []) files.remove(gone)
    return
  }
  // A file that is fetched whole is no write here, and the file of a tenant whose row is gone is not made anew.
  const made = !change.fetch && !files.has(change.file)
  const store = change.fetch ? undefined : inside.plain(change.file, { make: true })
  try {
    if (store) applyToFile(store, change)
  } catch (error) {
    // A file that was made for a change which is not applied holds nothing of a tenant, and does not stay.
    if (made) files.remove(change.file)
    throw error
  }
  if (only !== 'file') keepIn(files.shared, change)
}

/**
 * Takes the store of a reader, or the files of an app, and one change of its writer. Puts the change into the
 * store as one write: the table steps, then the record with the rows of the change, then what `_t_here` and
 * `_t_changes` hold of it. It seals nothing: the rows that a rebuild sealed on the writer arrive in the record.
 * After the write it has the store forget each table that a raw SQL write of the change stated. Handed the files
 * of an app, it makes the write of the file that the change names, which it makes where it is not there, and then
 * the kept change in a write of the shared file; for a change that holds `fetch` the kept change alone; and it
 * removes the file of a tenant that the change says is gone. A change of a tenant whose row is gone, and one
 * whose number its file already holds, write no file. With `only: 'kept'` it writes the kept change and nothing
 * else, and with `only: 'file'`, handed the store of one tenant's file, the write of that file alone. Throws
 * T0033 where the running fingerprint of the change is not the one this store works out, and where a row is not as
 * the record expects it: the write is undone, and the store holds nothing of the change. Throws T0009 for a change
 * of a tenant's file that is handed under the name of another tenant: nothing of it is applied, neither the
 * file nor the kept change. Throws T0013 for a store that cannot be copied.
 */
export function applyChange(on: Store | Files, change: Change, o: { only?: 'kept' | 'file' } = {}): void {
  if ('shared' in on) applyToFiles(on, change, o.only)
  else if (o.only === 'file') applyToFile(on, change)
  else if (o.only !== 'kept') applyTo(on, change, on)
  else {
    copyOf(on)
    try {
      on.write((tx) => keepChange(on, tx, change, kept, Date.now()))
    } catch (error) {
      forgetKept(on)
      throw error
    }
  }
}
