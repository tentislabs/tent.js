import { BroadcastChannel } from 'node:worker_threads'

/** What the work did, as the test keeps it: each call of each work with what it was handed, and a gate it waits at. */
export interface Seen {
  calls: { work: string; input: unknown }[]
  // Holds back the work of one definition, where a test sets it.
  gate?: { work: string; held: Promise<void> }
}

/**
 * Tells the test of a call of a work, over a channel that every thread of the program shares, so that the test
 * hears it in whatever room the code runs, and waits for its answer: the test holds it at a gate where it sets one.
 */
export function noted(work: string, input: unknown): Promise<void> {
  const channel = new BroadcastChannel('tentjs.test.filling')
  // A call that nobody answers any more, of an app that was closed, holds the program up no longer.
  channel.unref()
  const id = `${work} ${Math.random()}`
  return new Promise((done, failed) => {
    channel.onmessage = (event: unknown) => {
      const answer = Object(Reflect.get(Object(event), 'data'))
      if (answer.id !== id || 'told' in answer) return
      channel.close()
      if ('failed' in answer) failed(new Error(String(answer.failed)))
      else done()
    }
    channel.postMessage({ id, told: { work, input } })
  })
}
