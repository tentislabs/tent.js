// The messages over the channel between the engine and the held program, the same on both sides: a question, its
// answer, or its failure, by the number of the question. A question across two programs is always answered later.
import type { Crossed } from '../crossing.ts'
import { errorIn, errorOut } from '../callables.ts'

/** One message of the channel. */
export type Message =
  | { k: 'ask'; id: number; what: string; body: unknown }
  | { k: 'reply'; id: number; value: unknown }
  | { k: 'failed'; id: number; error: Crossed }

/** One side of the channel: it asks the other side, and is asked by it. */
export interface Channel {
  ask(what: string, body: unknown): Promise<unknown>
  // Hands the side a message that came over the channel.
  take(message: unknown): void
  // Refuses every question still waiting, as when the other side has ended.
  fail(error: Error): void
}

const isMessage = (value: unknown): value is Message =>
  typeof value === 'object' && value !== null && typeof Reflect.get(value, 'id') === 'number'

/**
 * Takes what sends a message to the other side, and what serves a question of the other side: a value, or a
 * promise of one. Answers this side of the channel.
 */
export function channelOf(send: (message: Message) => void, serve: (what: string, body: unknown) => unknown): Channel {
  let asked = 0
  const waiting = new Map<number, { done(value: unknown): void; failed(error: unknown): void }>()
  return {
    ask(what, body) {
      const id = ++asked
      return new Promise((done, failed) => {
        waiting.set(id, { done, failed })
        send({ k: 'ask', id, what, body })
      })
    },
    take(message) {
      if (!isMessage(message)) return
      if (message.k === 'ask') {
        const { id } = message
        Promise.resolve()
          .then(() => serve(message.what, message.body))
          .then(
            (value: unknown) => send({ k: 'reply', id, value }),
            (error: unknown) => send({ k: 'failed', id, error: errorOut(error) }),
          )
        return
      }
      const one = waiting.get(message.id)
      if (!one) return
      waiting.delete(message.id)
      if (message.k === 'reply') one.done(message.value)
      else one.failed(errorIn(message.error))
    },
    fail(error) {
      for (const one of waiting.values()) one.failed(error)
      waiting.clear()
    },
  }
}
