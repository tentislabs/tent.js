import { parentPort, threadId, workerData } from 'node:worker_threads'
import { TentError } from '../../core/index.ts'
import type { Clock } from '../../core/internal.ts'
import { setRuntime } from '../../core/internal.ts'
import type { Files, Store } from '../../data/index.ts'
import { idMaker, NotReady, sqliteStore } from '../../data/index.ts'
import type { App } from '../app.ts'
import { loadCode, needsCode } from '../code.ts'
import { loneMachine } from '../lone.ts'
import { called } from '../door/call.ts'
import { failureOf, refusedCall } from '../door/failure.ts'
import { list as handleList } from '../handles/list.ts'
import { systemClock } from '../makers.ts'
import type { Opened } from '../opened.ts'
import { slot } from '../slot.ts'
import { makeRoom } from '../rooms/makeRoom.ts'
import { reading, sentReads, watchStore } from '../watched.ts'
import { wrapFetch } from '../wrapFetch.ts'
import type { Job, Start, ThreadTold } from './messages.ts'
import { threadMs } from '../counts/cpu.ts'
import { countsGoTo, gather, writeCounts } from '../counts/gather.ts'
import { crossed } from '../rooms/crossing.ts'
import { notesOf, underTest, writeNotes } from '../touched.ts'

// The program of one query thread. It holds a store of its own, opened to read alone, and carries out one query at
// a time, through every step of the door from 5 to 10. What it writes into the log crosses to the main thread.

const isStart = (given: unknown): given is Start =>
  typeof given === 'object' && given !== null && typeof Reflect.get(given, 'dataFolder') === 'string'

const start: unknown = workerData
const port = parentPort
if (!port || !isStart(start)) throw new TentError('T0009', 'A query thread was started with nothing to work on.')

const tell = (told: ThreadTold): void => port.postMessage(told)
const noWeb = (): never => {
  throw new TentError('T0013', 'A query thread answers queries, and holds no app.')
}

// The moment of the app's clock, which the main thread hands on with each call: a clock that a maker made cannot cross.
let ahead = 0
const clock: Clock = { now: () => systemClock.now() + ahead, setTimer: systemClock.setTimer }

// Of an app that keeps a data file for each tenant the thread holds the files, each opened to read alone.
let files: (Files & { number(): number }) | undefined
if (start.fingerprints) {
  const [{ threadFiles }, { engineTables, layoutFor }] = await Promise.all([
    import('../files/onThread.ts'),
    import('../tableChanges.ts'),
  ])
  files = threadFiles(start.dataFolder, layoutFor(start.description, await engineTables()), start.fingerprints)
}
const store: Store = files?.shared ?? sqliteStore()
if (!files) store.open(start.dataFolder, { readOnly: true })
// A read that the live hub watches tells what it read: the thread writes nothing, so nothing is told of a write.
watchStore(store, () => undefined)
const app: App = {
  description: start.description,
  call: async () => noWeb(),
  request: async () => noWeb(),
  live: () => noWeb(),
  add: async () => noWeb(),
  switch: async () => noWeb(),
  versions: () => noWeb(),
  drop: async () => noWeb(),
  show: () => noWeb(),
  inspect: () => noWeb(),
  page: async () => noWeb(),
  session: () => noWeb(),
  standIn: () => noWeb(),
  called: async () => noWeb(),
  read: async () => noWeb(),
  write: async () => noWeb(),
  logs: async () => noWeb(),
  seed: async () => noWeb(),
  shot: async () => noWeb(),
  export: async () => noWeb(),
  snapshot: async () => noWeb(),
  restore: async () => noWeb(),
  facts: () => noWeb(),
  values: async () => noWeb(),
  caller: async () => noWeb(),
  role: 'writer',
  link: () => noWeb(),
  at: () => noWeb(),
  machines: () => noWeb(),
  workers: () => noWeb(),
  work: () => noWeb(),
  release: () => noWeb(),
  filled: () => noWeb(),
  takeOver: async () => noWeb(),
  close: async () => undefined,
  ready: async () => undefined,
  start: async () => noWeb(),
  runs: {
    read: () => noWeb(),
    find: () => noWeb(),
    wait: async () => noWeb(),
    approve: () => noWeb(),
    refuse: () => noWeb(),
    stop: () => noWeb(),
    stopAll: () => noWeb(),
    replayAll: () => noWeb(),
    pause: () => noWeb(),
    resume: () => noWeb(),
    paused: () => noWeb(),
  },
}
const o: Opened = {
  name: start.name,
  mode: start.mode,
  dataFolder: start.dataFolder,
  bundle: start.bundle,
  version: start.version,
  description: start.description,
  store,
  ...(files ? { files } : {}),
  clock,
  ids: idMaker(() => clock.now()),
  // A thread writes its rows through the main thread, which alone holds the log, and reads none.
  log: {
    write: (table, row) => tell({ log: { table, row } }),
    writeAll: (table, rows) => {
      for (const row of rows) tell({ log: { table, row } })
    },
    rows: () => [],
    withTrace: () => [],
    traceOfRun: () => undefined,
    last: () => 0,
    dropBefore: () => 0,
    forget: () => 0,
    close: () => undefined,
  },
  token: '',
  // A query thread waits for no opening and closes no app.
  waits: { open: 0, stop: 0 },
  // The thread's own room, of the program: a heavy query of the app is carried out here as in the main thread.
  room: makeRoom(undefined, { app: start.name, dataFolder: start.dataFolder, mode: start.mode, where: 'query' }),
  runs: new Map(),
  allows: new Map(),
  rules: {},
  handles: new Map(),
  made: [],
  before: [],
  inFlight: new Set(),
  closed: false,
  web: {
    names: () => false,
    own: () => false,
    about: (came) => ({ ...came, origin: `${came.scheme}://${came.host}`, proxied: false }),
  },
  machine: loneMachine({ store }),
  app,
  raise(event, told) {
    if (event === 'call.failed' && 'error' in told)
      tell({ raise: { name: told.name, caller: told.caller, failed: crossed(told.error) } })
  },
  left: () => undefined,
}
for (const { name, load } of handleList) o.handles.set(name, (await load()).handle(o))
setRuntime(slot)
wrapFetch()

// The modules of the bundle are loaded for the first query that may need one, and never for a query that needs none.
let loaded = false

// What the thread counted is handed to the main thread, which writes the counts of the app.
countsGoTo(o, (amounts) => tell({ counted: amounts }))

port.on('message', async (job: Job) => {
  const began = performance.now()
  const cpu = threadMs()
  ahead = job.now - systemClock.now()
  try {
    if (!loaded && needsCode(o.description, job.name)) {
      try {
        await loadCode(o)
        loaded = true
      } catch (error) {
        refusedCall(o, job.name, job.caller, began, error)
        throw error
      }
    }
    // A read that was handed over again goes on in the time it had left.
    const ends = job.left === undefined ? {} : { ends: began + job.left }
    const call = (): unknown => called(o, job.name, job.input, { caller: job.caller, ...ends })
    const { answer, reads } = reading(() => (job.test === undefined ? call() : underTest(notesOf(job.test), call)))
    tell({ id: job.id, value: answer, ...(job.reads ? { reads: sentReads(reads) } : {}) })
  } catch (error) {
    if (error instanceof NotReady)
      tell({ id: job.id, notReady: error.file, ...(Reflect.get(error, 'lacks') === true ? { lacks: true } : {}) })
    else tell({ id: job.id, failed: crossed(error, failureOf(o, job.name, error).ref) })
  } finally {
    // A heavy read opens the files of tenants for that read, and closes them.
    for (const file of files?.open() ?? []) files?.close(file)
    // The processor time of the read is read by the clock of this thread, which does one read at a time.
    gather(o, job.name, { cpuMs: threadMs() - cpu }, { caller: job.caller })
    writeCounts(o)
    // The thread keeps a record of its own of what each test touched here, written after each call of a test.
    const noted = process.env.TENT_TOUCHED
    if (job.test !== undefined && noted) writeNotes(noted, `${process.pid}-${threadId}`)
  }
})
tell({ ready: true })
