import { Worker } from 'node:worker_threads'
import type { Source } from '../build/index.ts'
import type { Finding } from '../core/index.ts'
import type { Description } from '../core/internal.ts'

/** What the thread of the rules is asked: the paths of the source in their order, the texts that changed, and the description. */
export interface RulesAsked {
  n: number
  paths: string[]
  texts: Record<string, { file: string; text: string; tree: boolean }>
  description: Description
}

/** What the thread of the rules answers: what they found, or why they could not be carried out. */
export type RulesTold = { n: number; found: Finding[] } | { n: number; failed: string }

/** Our rules on a thread of their own, which holds a build against them while the program goes on with its own work. */
export interface RulesThread {
  over(built: { source: Source; description: Description }): Promise<Finding[]>
  close(): Promise<void>
}

/** A build that waits for the thread: what it is, how often it was handed to a thread, and whom to answer. */
interface Waiting {
  built: { source: Source; description: Description }
  handed: number
  done(found: Finding[]): void
  failed(error: Error): void
}

const closed = 'The thread of our rules was closed.'

/**
 * Starts the thread of our rules, for a session of development, at once: it loads its code while the session loads
 * and builds, so the first build waits for the rules alone. Each build is held against every rule of our own
 * that needs nothing of a running app, as `rulesOver` holds it; the thread is handed only the texts that changed
 * since the build before, with the description, and keeps the tree of every other. A thread that ends on its own,
 * as one that runs out of memory, is started again, and each build that waited is handed to it anew; one that ends
 * the thread a second time is answered with the error it ended with. `close` ends the thread for good: each build
 * that waits fails, and so does each that is handed after it.
 */
export function rulesThread(): RulesThread {
  // What the thread that runs holds of each file, so that it is handed only what changed.
  const sent = new Map<string, { text: string; tree: boolean }>()
  const waiting = new Map<number, Waiting>()
  // Whether the thread was closed: a build handed after it fails at once, and no thread is started again.
  let shut = false
  let asked = 0
  let worker: Worker | undefined

  const started = (): Worker => {
    if (worker) return worker
    const thread = new Worker(new URL('./rulesWorker.ts', import.meta.url))
    // A thread that waits for a build does not keep the program running.
    thread.unref()
    sent.clear()
    let ended: Error | undefined
    thread.on('message', (told: RulesTold) => {
      const one = waiting.get(told.n)
      waiting.delete(told.n)
      if ('found' in told) one?.done(told.found)
      else one?.failed(new Error(`The rules could not be carried out: ${told.failed}`))
    })
    thread.on('error', (error) => {
      ended = error instanceof Error ? error : new Error(String(error))
    })
    thread.on('exit', () => {
      if (worker === thread) worker = undefined
      const why = `The thread of our rules ended${ended ? `: ${ended.message}` : ''}.`
      for (const [n, one] of [...waiting]) {
        if (!shut && one.handed < 2) continue
        waiting.delete(n)
        one.failed(new Error(shut ? closed : why))
      }
      for (const n of [...waiting.keys()].sort((a, b) => a - b)) handed(n)
    })
    worker = thread
    return thread
  }

  /** Hands a build that waits to the thread that runs, with the texts that thread does not hold yet. */
  const handed = (n: number): void => {
    const one = waiting.get(n)
    if (!one) return
    const thread = started()
    one.handed++
    const { source, description } = one.built
    const texts: RulesAsked['texts'] = {}
    const paths = Object.keys(source)
    for (const path of paths) {
      const { file, text, tree } = source[path]
      const held = sent.get(path)
      if (held?.text === text && held.tree === (tree !== undefined)) continue
      texts[path] = { file, text, tree: tree !== undefined }
      sent.set(path, { text, tree: tree !== undefined })
    }
    for (const path of [...sent.keys()]) if (!Object.hasOwn(source, path)) sent.delete(path)
    const message: RulesAsked = { n, paths, texts, description }
    thread.postMessage(message)
  }

  started()
  return {
    over(built) {
      if (shut) return Promise.reject(new Error(closed))
      const n = ++asked
      return new Promise((done, failed) => {
        waiting.set(n, { built, handed: 0, done, failed })
        handed(n)
      })
    },
    async close() {
      shut = true
      if (!worker) return
      await worker.terminate()
    },
  }
}
