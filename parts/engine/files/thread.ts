import { workerData } from 'node:worker_threads'
import { TentError } from '../../core/index.ts'
import type { Change, Misfit, OnThread, Store } from '../../data/index.ts'
import { applyChange, bringUp, checkAndHold, dropHolds, sqliteStore } from '../../data/index.ts'
import type { FileJob, FileStart, FileTold, RaiseJob } from './job.ts'
import { crossed } from '../rooms/crossing.ts'
import { ended, viewsOf, waits } from './job.ts'

// The program of one file thread. It holds a writing store of its own for one tenant's file at a time, while
// that file is open to nothing else. On a writer it brings the file up in one write: the number of that write is
// the app's, and the thread asks the main thread for it as the last act of the write, and waits for it. On a
// reader it puts one change of the writer into the file, which holds its own number.

const isStart = (given: unknown): given is FileStart =>
  typeof given === 'object' && given !== null && Reflect.get(given, 'shared') instanceof SharedArrayBuffer

const start: unknown = workerData
if (!isStart(start)) throw new TentError('T0009', 'A file thread was started with nothing to work on.')

const { port } = start
const { state, number } = viewsOf(start.shared)
const tell = (told: FileTold): void => port.postMessage(told)

/** What the one write of a job is handed: the number of that write is the app's, asked of the main thread as its last act. */
const threadOf = (job: RaiseJob & { id: number }): OnThread => ({
  keep: job.keep,
  epoch: job.epoch,
  number() {
    // The main thread commits nothing from the moment it hands the number until this write has ended.
    Atomics.store(state, 0, waits)
    tell({ id: job.id, number: true })
    Atomics.wait(state, 0, waits)
    if (job.fails) throw new TentError('T0009', 'The write of a file thread failed after it took its number.')
    return number[0]
  },
})

/** Carries the one write of a job out: the file is brought up, held to the steps of a check, or let go of its holds. */
function worked(store: Store, job: RaiseJob & { id: number }): { change?: Change; misfits?: Misfit[] } {
  const thread = threadOf(job)
  if (job.check) return checkAndHold(store, job.check.steps, job.check.version, { thread })
  const change =
    job.drop === undefined
      ? bringUp(store, job.layout, {
          thread,
          ...(job.back ? { back: true } : {}),
          ...(job.turned ? { turned: job.turned } : {}),
          ...(job.clean ? { clean: true } : {}),
        })
      : dropHolds(store, job.drop, { thread })
  return change ? { change } : {}
}

port.on('message', (job: FileJob) => {
  let told: FileTold
  try {
    const store = sqliteStore()
    store.open(job.path)
    try {
      if ('apply' in job) {
        applyChange(store, job.apply, { only: 'file' })
        told = { id: job.id }
      } else told = { id: job.id, ...worked(store, job) }
    } finally {
      store.close()
    }
  } catch (error) {
    told = { id: job.id, failed: crossed(error) }
  }
  // The answer stands in the channel before the main thread is woken, so that it reads it without a turn of its own.
  tell(told)
  Atomics.store(state, 0, ended)
  Atomics.notify(state, 0)
})
tell({ ready: true })
