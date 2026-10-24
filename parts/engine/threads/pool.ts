import { Worker } from 'node:worker_threads'
import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import { logCall } from '../door/failure.ts'
import { limitOf } from '../limits.ts'
import type { Opened } from '../opened.ts'
import type { TablesRead } from '../watched.ts'
import { addReads, readsNow } from '../watched.ts'
import { dbFor } from '../program.ts'
import type { Job, Start, ThreadTold } from './messages.ts'
import { revivedHere } from './messages.ts'
import { gatherRows } from '../counts/gather.ts'

/** The query threads of one app: a heavy query is carried out on one of them, and they end with the app. */
export interface QueryThreads {
  /**
   * Carries a query out on a thread, through every step of the door from 5 to 10, and answers a promise of what
   * leaves the engine. A query waits for a free thread. One that passes `queryTime` is stopped by ending its
   * thread, and fails with T0008. `ends` is the moment at which the time of the call is up, where it began before:
   * the read is held to it over every thread it is handed to, and over the wait for a file between them.
   */
  call(name: string, input: unknown, caller: Caller, began: number, ends?: number): Promise<unknown>
  close(): Promise<void>
}

/** A call that waits for a thread, or is out on one. */
interface Pending {
  job: Job
  began: number
  ends?: number
  // Since when it waits for a thread: that wait is no part of its time, as it never was.
  queued: number
  done(value: unknown): void
  failed(error: unknown): void
  timer?: NodeJS.Timeout
  // Where the live hub watches the read: what the thread read is added to what its run read.
  into?: TablesRead
  // The files that the main thread made whole for this call, each once.
  whole?: Set<string>
}

/** One thread: its program, whether it has said that it is ready, and the call it works on. */
interface Thread {
  worker: Worker
  ready: boolean
  pending?: Pending
}

const isTold = (given: unknown): given is ThreadTold => typeof given === 'object' && given !== null

/**
 * Takes what the engine holds of an app. Answers its query threads, of which none is started before the first
 * heavy query: there are `limits.queryThreads` of them at most, each with a store of its own that is opened to
 * read alone.
 */
export function queryThreads(o: Opened): QueryThreads {
  const most = limitOf(o.description, 'queryThreads')
  const time = limitOf(o.description, 'queryTime')
  const threads: Thread[] = []
  const waiting: Pending[] = []
  let ids = 0
  let closed = false

  /** Ends a call that did not come back from its thread: it is written into the log and told here, since its thread could not. */
  const lost = (pending: Pending, error: TentError): void => {
    clearTimeout(pending.timer)
    const { name, caller } = pending.job
    logCall(o, { name, kind: 'query', caller, began: pending.began, error })
    o.raise('call.failed', { app: o.app, name, caller, error })
    pending.failed(error)
  }

  const drop = (thread: Thread): void => {
    const at = threads.indexOf(thread)
    if (at >= 0) threads.splice(at, 1)
  }

  const late = (name: string): TentError =>
    new TentError('T0008', `${name} read past \`limits.queryTime\`, and was stopped.`, {
      fix: 'Read less in one query: state a `limit`, or an index for what its filter names.',
    })

  /** Hands the calls that wait to the threads that are free, and starts one more thread where one may be started. */
  const next = (): void => {
    for (const thread of threads) {
      if (!thread.ready || thread.pending || !waiting.length) continue
      const pending = waiting.shift()
      if (!pending) break
      if (pending.ends !== undefined) pending.ends += performance.now() - pending.queued
      const left = pending.ends === undefined ? undefined : pending.ends - performance.now()
      // A read whose time ran out while it waited for its file is handed to no thread again.
      if (left !== undefined && left <= 0) {
        lost(pending, late(pending.job.name))
        continue
      }
      thread.pending = pending
      // A heavy read that passes its time is stopped by ending its thread.
      pending.timer = setTimeout(() => {
        thread.pending = undefined
        drop(thread)
        void thread.worker.terminate()
        lost(pending, late(pending.job.name))
        next()
      }, left ?? time)
      thread.worker.postMessage(left === undefined ? pending.job : { ...pending.job, left })
    }
    const busy = threads.every((thread) => thread.pending || !thread.ready)
    const starting = threads.filter((thread) => !thread.ready).length
    if (waiting.length > starting && busy && threads.length < most) begin()
  }

  const begin = (): void => {
    const start: Start = {
      name: o.name,
      mode: o.mode,
      dataFolder: o.dataFolder,
      bundle: o.bundle,
      version: o.version,
      description: o.description,
      ...(o.tenantFiles ? { fingerprints: o.tenantFiles.fingerprints() } : {}),
    }
    const worker = new Worker(new URL('./query.ts', import.meta.url), { workerData: start })
    // A thread that waits for work does not keep the program running.
    worker.unref()
    const thread: Thread = { worker, ready: false }
    threads.push(thread)
    worker.on('message', (told: unknown) => {
      if (!isTold(told)) return
      if ('ready' in told) thread.ready = true
      else if ('log' in told) o.log.write(told.log.table, told.log.row)
      else if ('counted' in told) gatherRows(o, told.counted)
      else if ('raise' in told)
        o.raise('call.failed', {
          app: o.app,
          name: told.raise.name,
          caller: told.raise.caller,
          error: revivedHere(told.raise.failed),
        })
      else if (thread.pending?.job.id === told.id) {
        const pending = thread.pending
        thread.pending = undefined
        clearTimeout(pending.timer)
        if ('notReady' in told) {
          // The main thread opens, brings up and sweeps the file, and hands the read to a thread again.
          const ready = o.tenantFiles
            ? o.tenantFiles.ready(told.notReady)
            : Promise.reject(new Error('The app keeps no file.'))
          const file = told.notReady
          const lacks = told.lacks === true
          ready
            .then(() => {
              // A file that lacks a table of its layout is made whole here, in a write of its own, as a raw read
              // with `of` makes it where every other query is carried out. A read that asks for it a second time
              // would write: it is refused as a write of a query is.
              if (lacks) {
                const key = `${file.table} ${file.id}`
                if (pending.whole?.has(key))
                  throw new TentError('T0012', 'A write was tried through a db that only reads.', {
                    fix: 'A query reads. Move what writes into a change or an action.',
                  })
                pending.whole = (pending.whole ?? new Set()).add(key)
                dbFor(o, { kind: 'system' }).sql('SELECT 1', [], { of: file.id })
              }
              pending.queued = performance.now()
              waiting.unshift(pending)
              next()
            })
            .catch(pending.failed)
        } else if ('failed' in told) pending.failed(revivedHere(told.failed))
        else {
          if (pending.into && told.reads) addReads(pending.into, told.reads)
          pending.done(told.value)
        }
      }
      next()
    })
    const ended = (why: string): void => {
      drop(thread)
      const pending = thread.pending
      thread.pending = undefined
      if (pending) lost(pending, new TentError('T0009', `The query thread of ${pending.job.name} ended: ${why}`))
      if (!closed) next()
    }
    worker.on('error', (error) => ended(String(error)))
    worker.on('exit', () => ended('its program stopped.'))
  }

  return {
    call(name, input, caller, began, ends) {
      return new Promise((done, failed) => {
        if (closed) {
          failed(new TentError('T0013', `The app ${o.name} was closed, and carries no query out.`))
          return
        }
        const into = readsNow()
        const job: Job = { id: ++ids, name, input, caller, now: o.clock.now(), ...(into ? { reads: true } : {}) }
        const more = { ...(ends === undefined ? {} : { ends }), ...(into ? { into } : {}) }
        waiting.push({ job, began, queued: performance.now(), done, failed, ...more })
        next()
      })
    },
    async close() {
      closed = true
      const gone = new TentError('T0013', `The app ${o.name} was closed while its query waited.`)
      for (const pending of waiting.splice(0)) pending.failed(gone)
      await Promise.all(
        threads.splice(0).map((thread) => {
          const pending = thread.pending
          thread.pending = undefined
          if (pending) {
            clearTimeout(pending.timer)
            pending.failed(gone)
          }
          return thread.worker.terminate()
        }),
      )
    },
  }
}
