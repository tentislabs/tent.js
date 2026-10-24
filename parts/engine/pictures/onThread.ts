import { availableParallelism } from 'node:os'
import { Worker } from 'node:worker_threads'
import type { PictureFormat } from '../borrowed/sharp.ts'

/** What the resizer is asked: a copy at a width in a kind, or, with neither, the tiny copy. */
export interface ResizeAsk {
  width?: number
  written?: PictureFormat
  points: number
}

// The threads of the resizer at work in this program, and the askings that wait for a place: a page of many
// pictures, asked by many at once, starts no more threads than the computer has places for.
const most = Math.max(1, Math.floor(availableParallelism() / 2))
let working = 0
const waiting: (() => void)[] = []

/**
 * Takes the folder of the resizer, the bytes of a picture, what is asked of it, and how long it may take. Has the
 * picture opened on a thread of its own once one of the few places is free, which is ended when the time is up.
 * Answers the copy, or throws where the picture breaks the resizer or takes longer.
 */
export async function resized(part: string, bytes: Uint8Array, ask: ResizeAsk, ms: number): Promise<Uint8Array> {
  if (working >= most) await new Promise<void>((free) => waiting.push(free))
  working += 1
  try {
    return await onThread(part, bytes, ask, ms)
  } finally {
    working -= 1
    waiting.shift()?.()
  }
}

/** Opens one picture on a thread of its own, which is ended when the time is up. */
function onThread(part: string, bytes: Uint8Array, ask: ResizeAsk, ms: number): Promise<Uint8Array> {
  const worker = new Worker(new URL('./thread.ts', import.meta.url), { workerData: { part, bytes, ask } })
  let timer: NodeJS.Timeout | undefined
  return new Promise<Uint8Array>((done, failed) => {
    timer = setTimeout(() => failed(new Error(`The resizer took longer than ${ms} ms.`)), ms)
    worker.once('message', (told: unknown) => {
      const made: unknown = Reflect.get(Object(told), 'bytes')
      if (made instanceof Uint8Array) done(made)
      else failed(new Error(String(Reflect.get(Object(told), 'error') ?? 'The resizer made nothing.')))
    })
    worker.once('error', failed)
    worker.once('exit', () => failed(new Error('The thread of the resizer ended with no answer.')))
  }).finally(() => {
    clearTimeout(timer)
    void worker.terminate()
  })
}
