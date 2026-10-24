// The messages between the engine and the thread of the test room, the same on both sides. Each side, while it
// waits for an answer, looks at a shared flag and then sleeps on it, and takes the other side's messages as they
// come, so it serves what the other side asks while it waits for its own. The flags are four: what each side is
// woken by, and whether each side has ended, which a side that waits at once could learn by no event.
import type { MessagePort } from 'node:worker_threads'
import { receiveMessageOnPort } from 'node:worker_threads'
import { TentError } from '../../../core/index.ts'
import type { Crossed } from '../crossing.ts'
import { errorIn, errorOut } from '../callables.ts'

/** One message: a question, its answer, or its failure, by the number of the question. */
type Message =
  | { k: 'ask'; id: number; what: string; body: unknown }
  | { k: 'reply'; id: number; value: unknown }
  | { k: 'failed'; id: number; error: Crossed }

/** One side of the wire: it asks the other side, and is asked by it. */
export interface Wire {
  // `sync`: waits for the answer, serving the other side meanwhile; `within`: the milliseconds it waits at most.
  ask(what: string, body: unknown, o: { sync: boolean; within?: number }): unknown
  // Refuses every question still waiting, as when the other side has ended.
  fail(error: Error): void
  // Tells the other side that this one ends, as its thread does when it stops.
  end(): void
}

// How long a side looks at its flag before it sleeps on it, in milliseconds: 50 µs.
const lookFor = 0.05

/** What a question that waited past its time is refused with. */
export const timedOut = new TentError('T0008', 'The room did not answer within the time of the call.')

/** What a question is refused with whose other side ended while it was waited for at once. */
export const otherEnded = new TentError('T0037', 'The other side of the room ended while it was asked.')

const isMessage = (value: unknown): value is Message =>
  typeof value === 'object' && value !== null && typeof Reflect.get(value, 'id') === 'number'

/**
 * Takes the port of this side, the shared flags, which of the two this side is, and what serves a question of the
 * other side: a value, or a promise, which is answered once it is settled. Answers this side of the wire.
 */
export function wireOf(
  port: MessagePort,
  flags: Int32Array,
  side: 0 | 1,
  serve: (what: string, body: unknown) => unknown,
): Wire {
  const other = side === 0 ? 1 : 0
  let asked = 0
  // The answers that came for a question a wait below another one still holds.
  const answers = new Map<number, Message>()
  const waiting = new Map<number, { done(value: unknown): void; failed(error: unknown): void }>()
  const post = (message: Message): void => {
    port.postMessage(message)
    Atomics.add(flags, other, 1)
    Atomics.notify(flags, other)
  }
  const served = (id: number, work: () => unknown): void => {
    let answer: unknown
    try {
      answer = work()
    } catch (error) {
      post({ k: 'failed', id, error: errorOut(error) })
      return
    }
    if (answer instanceof Promise)
      answer.then(
        (value: unknown) => post({ k: 'reply', id, value }),
        (error: unknown) => post({ k: 'failed', id, error: errorOut(error) }),
      )
    else post({ k: 'reply', id, value: answer })
  }
  const handle = (message: unknown): void => {
    if (!isMessage(message)) return
    if (message.k === 'ask') {
      served(message.id, () => serve(message.what, message.body))
      return
    }
    const one = waiting.get(message.id)
    if (!one) {
      answers.set(message.id, message)
      return
    }
    waiting.delete(message.id)
    held()
    if (message.k === 'reply') one.done(message.value)
    else one.failed(errorIn(message.error))
  }
  port.on('message', handle)
  // The side of the engine holds its program up only while it waits for an answer; the thread lives by its wire.
  const held = (): void => {
    if (side === 1 || waiting.size) port.ref()
    else port.unref()
  }
  held()
  return {
    ask(what, body, o) {
      const id = ++asked
      if (!o.sync)
        return new Promise((done, failed) => {
          waiting.set(id, { done, failed })
          held()
          post({ k: 'ask', id, what, body })
        })
      post({ k: 'ask', id, what, body })
      const ends = o.within === undefined ? Number.POSITIVE_INFINITY : performance.now() + o.within
      for (;;) {
        const seen = Atomics.load(flags, side)
        for (let got = receiveMessageOnPort(port); got; got = receiveMessageOnPort(port)) handle(got.message)
        const answer = answers.get(id)
        if (answer) {
          answers.delete(id)
          if (answer.k === 'reply') return answer.value
          if (answer.k === 'failed') throw errorIn(answer.error)
        }
        if (Atomics.load(flags, 2 + other) !== 0) throw otherEnded
        const left = ends - performance.now()
        if (left <= 0) throw timedOut
        // Each side looks at its flag a moment before it sleeps on it: the wake from the sleep is most of what a
        // crossing costs, and the other side often answers within that moment.
        const looked = performance.now() + lookFor
        let still = Atomics.load(flags, side) === seen
        while (still && performance.now() < looked) still = Atomics.load(flags, side) === seen
        if (still) Atomics.wait(flags, side, seen, Math.min(left, 1000))
      }
    },
    fail(error) {
      for (const one of waiting.values()) one.failed(error)
      waiting.clear()
      held()
    },
    end() {
      Atomics.store(flags, 2 + side, 1)
      Atomics.notify(flags, other)
    },
  }
}
