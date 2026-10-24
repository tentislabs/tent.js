import type { MessagePort } from 'node:worker_threads'
import { MessageChannel, receiveMessageOnPort, Worker } from 'node:worker_threads'
import { TentError } from '../../core/index.ts'
import type { Change, Misfit } from '../../data/index.ts'
import type { ApplyJob, FileJob, FileStart, FileTold, RaiseJob } from './job.ts'
import { revived } from '../rooms/crossing.ts'
import { ended, jobHanded, viewsOf } from './job.ts'

/** What the main thread does for the one write of a file thread. */
interface Writes {
  /** Hands out the app's next number. */
  number(): number
  /** Is handed the change of the write, in the turn in which its number was handed out. */
  took(change: Change): void
  /** Is told the number of a write that took one and did not end. */
  lost(n: number): void
}

/** The file threads of one app: each works on one tenant's file at a time, and they end with the app. */
export interface FileThreads {
  /**
   * Brings one file up on a thread, in one write of that file. A file waits for a free thread. The promise is
   * refused with what the thread failed with: the file is then as it was.
   */
  bringUp(job: RaiseJob, writes: Writes): Promise<Misfit[] | undefined>
  /**
   * Puts one change of a writer into the file it is of, on a thread, in one write of that file: for a reader. The
   * promise is refused with what the thread failed with: the file is then as it was.
   */
  apply(job: ApplyJob): Promise<void>
  close(): Promise<void>
}

// What a write that holds its own number asks of the main thread: nothing.
const noWrites: Writes = {
  number() {
    throw new TentError('T0009', 'A change that is applied holds its own number, and asks for none.')
  },
  took: () => undefined,
  lost: () => undefined,
}

/** A file that waits for a thread, or is out on one. */
interface Pending {
  job: FileJob
  writes: Writes
  done(misfits?: Misfit[]): void
  failed(error: unknown): void
}

/** One thread: its program, its end of the channel, what it shares with this thread, and the file it works on. */
interface Thread {
  worker: Worker
  port: MessagePort
  state: Int32Array
  number: Float64Array
  ready: boolean
  pending?: Pending
  // The number that the write under way was handed.
  handed?: number
}

// How long this thread waits for a file thread to end a write that took its number, in milliseconds.
const commitTime = 120_000

const isTold = (given: unknown): given is FileTold => typeof given === 'object' && given !== null

// How many of the next writes that bring a file up fail right after they were handed their number.
let failing = 0

/**
 * Takes a count. So many of the next writes by which a file thread brings a file up fail right after they were
 * handed their number, as on a disk that fills at that moment: nothing else makes a thread fail there, so a test
 * asks for it. 0 takes it back.
 */
export function failAfterNumber(times: number): void {
  failing = times
}

/**
 * Takes how many threads there are at most. Answers the file threads of an app, of which none is started before
 * the first file is handed over.
 */
export function fileThreads(most: number): FileThreads {
  const threads: Thread[] = []
  const waiting: Pending[] = []
  let ids = 0
  let closed = false

  const drop = (thread: Thread): void => {
    const at = threads.indexOf(thread)
    if (at >= 0) threads.splice(at, 1)
  }

  /** Ends the file that a thread worked on with an error: a write that took a number and did not end is told. */
  const lost = (thread: Thread, error: unknown): void => {
    const pending = thread.pending
    thread.pending = undefined
    const n = thread.handed
    thread.handed = undefined
    if (!pending) return
    try {
      if (n !== undefined) pending.writes.lost(n)
    } finally {
      pending.failed(error)
    }
  }

  /** Hands the files that wait to the threads that are free, and starts one more thread where one may be started. */
  const next = (): void => {
    for (const thread of threads) {
      if (!thread.ready || thread.pending || !waiting.length) continue
      thread.pending = waiting.shift()
      if (thread.pending) thread.port.postMessage(thread.pending.job)
    }
    const starting = threads.filter((thread) => !thread.ready).length
    if (waiting.length > starting && threads.length < Math.max(1, most)) begin()
  }

  const taken = (thread: Thread, told: unknown): void => {
    if (!isTold(told)) return
    if ('ready' in told) {
      thread.ready = true
      next()
      return
    }
    const pending = thread.pending
    if (!pending || pending.job.id !== told.id) return
    if ('number' in told) {
      const n = pending.writes.number()
      thread.handed = n
      thread.number[0] = n
      Atomics.store(thread.state, 0, jobHanded)
      Atomics.notify(thread.state, 0)
      // Nothing is committed here until the thread has ended its write: this thread waits for that, and then
      // reads the answer from the channel in the same turn, so that the change is kept before any other write.
      Atomics.wait(thread.state, 0, jobHanded, commitTime)
      for (let got = receiveMessageOnPort(thread.port); got; got = receiveMessageOnPort(thread.port))
        taken(thread, got.message)
      return
    }
    if ('failed' in told) {
      lost(thread, revived(told.failed))
      next()
      return
    }
    thread.pending = undefined
    thread.handed = undefined
    try {
      if (told.change) pending.writes.took(told.change)
      pending.done('misfits' in told ? told.misfits : undefined)
    } catch (error) {
      pending.failed(error)
    }
    next()
  }

  const begin = (): void => {
    const shared = new SharedArrayBuffer(16)
    const { port1, port2 } = new MessageChannel()
    const start: FileStart = { port: port2, shared }
    const worker = new Worker(new URL('./thread.ts', import.meta.url), { workerData: start, transferList: [port2] })
    // A thread that waits for work does not keep the program running.
    worker.unref()
    port1.unref()
    const thread: Thread = { worker, port: port1, ...viewsOf(shared), ready: false }
    Atomics.store(thread.state, 0, ended)
    threads.push(thread)
    port1.on('message', (told: unknown) => taken(thread, told))
    const gone = (why: string): void => {
      drop(thread)
      lost(thread, new TentError('T0009', `The file thread ended: ${why}`))
      if (!closed) next()
    }
    worker.on('error', (error) => gone(String(error)))
    worker.on('exit', () => gone('its program stopped.'))
  }

  /** Hands one file to the threads, where it waits for a free one. */
  const handOver = (job: RaiseJob | ApplyJob, writes: Writes): Promise<Misfit[] | undefined> =>
    new Promise((done, failed) => {
      if (closed) {
        failed(new TentError('T0013', 'The app was closed, and no thread works on a file of it.'))
        return
      }
      const raises = !('apply' in job) && !job.check && job.drop === undefined
      const fails = raises && failing > 0 && failing-- > 0
      waiting.push({ job: { ...job, id: ++ids, ...(fails ? { fails } : {}) }, writes, done, failed })
      next()
    })

  return {
    bringUp: handOver,
    apply: (job) => handOver(job, noWrites).then(() => undefined),
    async close() {
      closed = true
      const gone = new TentError('T0013', 'The app was closed while a file waited to be brought up.')
      for (const pending of waiting.splice(0)) pending.failed(gone)
      await Promise.all(
        threads.splice(0).map((thread) => {
          const pending = thread.pending
          thread.pending = undefined
          pending?.failed(gone)
          thread.port.close()
          return thread.worker.terminate()
        }),
      )
    },
  }
}
