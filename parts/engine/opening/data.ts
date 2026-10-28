import type { Description } from '../../core/internal.ts'
import type { Connections, Store, TableLayout, TableStep } from '../../data/index.ts'
import { connected, sqliteStore } from '../../data/index.ts'
import { archiveSink, keepsArchive, makeArchive } from '../archived/archive.ts'
import type { TenantFiles } from '../files/face.ts'
import { manyLimit } from '../held.ts'
import { limitOf } from '../limits.ts'
import { openLog } from '../log/file.ts'
import { withRunTables } from '../flows/fileTables.ts'
import { keepMail } from '../mail/send.ts'
import { watchOutside } from '../outside.ts'
import { cacheWrote } from '../pages/cache.ts'
import { keepParts } from '../parts.ts'
import { keepReaders } from '../readers/text.ts'
import { builtFrom, recorded } from '../record.ts'
import { fedTx, mayRemember } from '../remember/kept.ts'
import { fillTx } from '../fill/marks.ts'
import { setFileStore } from '../stored/files.ts'
import { engineTables, layoutFor } from '../tableChanges.ts'
import { queryThreads } from '../threads/pool.ts'
import { cleanLog } from '../values/cleanLog.ts'
import { exportTraces } from '../trace/export.ts'
import { tracedLog } from '../trace/logged.ts'
import { loadConnect } from '../services/loaded.ts'
import { keepSigning } from '../services/signing.ts'
import { keepModels } from '../ai/opening.ts'
import { valuesOf } from '../values/ofApp.ts'
import { forgetSeal, keepSearcher } from '../values/seal.ts'
import { watchStore } from '../watched.ts'
import type { UnderWay } from './frame.ts'
import { refused } from './frame.ts'
import { withShown } from '../counts/shown.ts'

// The oldest SQLite that the data is opened with, and the newest layout of a data file that this engine knows.
const oldestStore = [3, 51, 3]
const ownLayout = 1

/** Whether a version in the form `3.51.3` is older than the one the engine needs. One of another form is not held. */
function isOlder(version: string): boolean {
  if (!/^\d+(\.\d+)*$/.test(version)) return false
  const parts = version.split('.').map(Number)
  for (const [i, least] of oldestStore.entries()) {
    const part = parts[i] ?? 0
    if (part !== least) return part < least
  }
  return false
}

/** Holds a store that stands open to what the engine can work with. Throws T0018 where it cannot. */
function held(store: Store, description: Description): void {
  const { engine, layout } = store.version()
  if (isOlder(engine))
    throw refused(
      'T0018',
      `The data cannot be opened: the store is SQLite ${engine}, and the engine needs ${oldestStore.join('.')} or newer.`,
      'Run the app on the runtime that the framework ships with.',
    )
  if (layout > ownLayout)
    throw refused(
      'T0018',
      `The data cannot be opened: its file is of the layout ${layout}, made by a newer engine than this one, which knows the layout ${ownLayout}.`,
      'Run the app with an engine as new as the one that wrote its data.',
    )
  if (store.sql) return
  const groups = [description.functions, description.flows, description.routes]
  const tied = groups.flatMap((group) => Object.keys(group).filter((name) => group[name].tiedTo === 'sqlite'))
  if (tied.length)
    throw refused(
      'T0018',
      `The data cannot be opened: ${tied.join(', ')} ${tied.length === 1 ? 'is' : 'are'} tied to SQLite by raw SQL, and the store of this app has none.`,
      'Run the app on the SQLite store, or write those definitions with plans.',
    )
}

/** The data of an app as an opening opened it: the tables of the engine, and its files where it keeps one for each tenant. */
export interface Data {
  tables: TableLayout[]
  // What holds the files of tenants, and what opens them: of an app that has a tenant table, and of no other.
  filing?: typeof import('../files/opening.ts')
  tenantFiles?: TenantFiles
  // The data file was made from a place of record that states `source`: it begins a new epoch.
  built?: true
  // The steps that make a column required which a backfill fills: they are taken once the backfills ran.
  later?: TableStep[]
}

/**
 * Takes the frame of an opening. Has the maker make the store of the app, opens its data and its log, and holds
 * the store to what the engine can work with. Answers the data. What it opened is taken back by the frame.
 */
export async function openData(f: UnderWay): Promise<Data> {
  const { o, input } = f
  const { dataFolder, description } = f.w
  const reads = f.w.told.reads
  const { store } = f.program.makers
  // The key of the folder is looked for anew at each opening: it may be another one than at the last.
  forgetSeal(dataFolder)
  const tables = await engineTables()
  const layout = layoutFor(description, tables)
  if (f.w.keepRows) o.keepRows = true
  // The writer keeps every committed change in its archive, which is made before the first write of the opening.
  // A reader is connected to it too, and records nothing until it takes over and makes an archive of its own.
  if (!reads && keepsArchive(description)) o.made.push(makeArchive(o))
  const connections: Connections = {
    clock: o.clock,
    kept: manyLimit(description, 'sinkSize'),
    wait: manyLimit(description, 'sinkWait'),
    // Each committed write of a writer is handed to its readers, and noted for the request that made it.
    copy: (change) => f.machine()?.noted(change),
    memory: (rows) => f.machine()?.writer?.memory(rows),
    // `data` writes no log: a search of the builder's own that failed on a committed write is said here, by its
    // name and the number of the write, and `data` hands it the write again after a wait, or, past the bound of
    // what waits, lets it go until the next opening.
    noted(what) {
      if (!('searcher' in what)) return
      const error = what.error instanceof Error ? what.error.message : String(what.error)
      try {
        o.log.write('lines', {
          at: o.clock.now(),
          level: 'error',
          message:
            what.searcher === 'closed'
              ? 'The search of the app held more writes than may wait, and is handed its rows again at the next opening.'
              : 'The search of the app failed on a committed write, and is handed it again after a wait.',
          data: JSON.stringify({ searcher: 'search', n: what.n, error }),
        })
      } catch {
        // While the app opens its log is not open yet.
      }
    },
    ...(keepsArchive(description) ? { archive: archiveSink(o) } : {}),
  }
  // An app that keeps a data file for each tenant loads what holds its files, and no other app loads it.
  const filing = layout.some((one) => one.tenant !== undefined) ? await import('../files/opening.ts') : undefined
  const makeStore = (): Store => store?.(input) ?? sqliteStore(o.ids)
  // The bytes of the files lie in the folder that ships, unless a maker of the program keeps them elsewhere.
  const { makers } = f.program
  if (makers.files) setFileStore(o, makers.files(input))
  keepReaders(o, makers.textReaders?.(input) ?? [])
  keepParts(o, f.program.parts ?? {})
  // A search and a continuous copy of the builder's own are handed to `data`, which tells them every write.
  const made = makers.changes?.(input)
  // A sink that is the place of record is waited for: what it took is noted, and an empty folder is made from it.
  const sink = made ? recorded(o, made, reads !== undefined) : undefined
  const searcher = makers.search?.(input)
  let built = false
  if (searcher) Object.assign(connections, { searcher })
  if (sink) Object.assign(connections, { sink })
  keepSearcher(dataFolder, searcher)
  for (const one of [searcher, made]) if (one) o.made.push(one)
  // The mailer of the app is made once, at its opening, and told when the app is closed.
  const mailer = makers.mailer?.(input)
  if (mailer) o.made.push(mailer)
  const host = makers.workers?.(input)
  if (host) o.workersHost = host
  // The closed room of the host is made with the app, for the workspaces that a program makes over it.
  const sandbox = makers.sandbox?.(input)
  if (sandbox) {
    o.sandbox = sandbox
    o.made.push(sandbox)
  }
  keepMail(o, { ...(mailer ? { mailer } : {}), send: f.w.sendMail === true })
  // A service or a call coming in that names a sign-in or a check that nobody made stops the opening.
  keepSigning(o, description, { signers: makers.signers?.(input) ?? {}, verifiers: makers.verifiers?.(input) ?? {} })
  // An app that holds a model loads the part of the models, and a model that names a provider nobody made stops the opening.
  await keepModels(o, description, makers, input)
  // An app that holds a service or a call coming in loads the part of the services when it opens, and no other does.
  if (Object.keys(description.services).length || Object.keys(description.incoming).length) await loadConnect()
  // The files of tenants may hold the run tables: a run lives in the file it was added in.
  const fileLayout = filing ? layoutFor(description, await withRunTables(description, tables)) : layout
  const tenantFiles = filing?.openTenantFiles(o, {
    make: makeStore,
    layout: fileLayout,
    connections,
    reads: reads !== undefined,
    threads: !store,
  })
  // A reader follows the versions of its writer: the first that has a tenant table has it open its files. So does
  // a writer that switches with `move` to the first version that has a tenant table.
  if (!tenantFiles)
    o.toFiles = async () => {
      delete o.toFiles
      const threads = o.threads
      delete o.threads
      await threads?.close()
      const first = await import('../files/opening.ts')
      // The shared file is opened anew as one of the files, with nothing in between.
      o.store.close()
      const files = first.openTenantFiles(o, {
        make: makeStore,
        layout: layoutFor(o.description, await withRunTables(o.description, tables)),
        connections,
        reads: reads !== undefined,
        threads: !store,
      })
      // The directory is a table of this machine alone: no change of the writer makes it here.
      if (reads) files.made()
      await first.startTenantFiles(o, files, reads !== undefined)
      // The shared file of a writer is the one that a write from outside is watched for from now on.
      if (!reads) watchOutside(o)
      if (threads) o.threads = queryThreads(o)
    }
  if (tenantFiles)
    f.started.push(() => {
      tenantFiles.closeFiles()
      o.store.close()
      // The file threads that an opening started end with it.
      void tenantFiles.close()
    })
  else {
    const plain = makeStore()
    built =
      !reads &&
      (await builtFrom(
        plain,
        dataFolder,
        made,
        layout.filter((one) => one.own),
      ))
    o.store = connected(plain, layout, connections)
    // Each write marks the values of the columns that work fills, inside itself, and takes the remembered answers
    // that a row it changes or removes fed with that row.
    const marking = o.store.write.bind(o.store)
    o.store.write = (fn, how) => marking((tx) => fn(mayRemember(o) ? fedTx(o, fillTx(o, tx)) : fillTx(o, tx)), how)
    watchStore(o.store, (written, every) => {
      // A write of the counts is told under the name of the table that shows them too.
      const touched = withShown(o.description, written)
      o.hub?.wrote(touched, every)
      cacheWrote(o, touched, every)
    })
    f.started.push(() => plain.close())
    o.store.open(dataFolder)
  }
  held(o.store, description)
  // No secret is written into a log: every value that the engine holds is taken out of each row before it is kept.
  // Each row names the trace it was written in, and what is kept of traces is sent out where the project says so.
  o.log = cleanLog(tracedLog(openLog(dataFolder, limitOf(description, 'logSize')), o), () => valuesOf(o).forms())
  exportTraces(o)
  watchOutside(o)
  f.started.push(() => o.log.close())
  return {
    tables,
    ...(filing ? { filing } : {}),
    ...(tenantFiles ? { tenantFiles } : {}),
    ...(built ? { built: true } : {}),
  }
}
