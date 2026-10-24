import type { WireError } from '../../core/index.ts'
import { isStored } from '../../core/internal.ts'

/** One call that the page holds for want of a connection, in the order it was made. */
interface Held {
  send(): Promise<unknown>
  done(value: unknown): void
  failed(error: unknown): void
  waiting(on: boolean): void
  // When the call was made, by the clock of the page: it is held until `callHold` past it, and no longer.
  made: number
  sending: boolean
}

/** What the queue of held calls is handed: the clock of the page, a timer, how long a call is held, and the online word. */
export interface QueueReach {
  now(): number
  wait(work: () => void, ms: number): () => void
  hold: number
  // Is told each time the browser says it is online again.
  online?(heard: () => void): void
}

/** What a page sends its calls through. */
export interface Queue {
  // Sends a call: at once while nothing is held, or after every call that is held before it. A call whose request
  // fails as the network's is held, and `waiting` is told when it is and when it is no longer.
  send(work: () => Promise<unknown>, waiting: (on: boolean) => void): Promise<unknown>
  // Whether a call is held, so that a page closed with calls held asks the browser to warn first.
  holds(): boolean
  // Is told that the connection is back, as the live connection opened again: what is held is sent now.
  back(): void
}

/** A failure that is the network's, and no answer of the engine: a request that never arrived, or an answer cut off. */
const isNetwork = (error: unknown): boolean => !(isStored(error) && typeof error.code === 'string')

// The waits between the tries of a call that is held, in milliseconds: the last one is kept from then on.
const tries = [1000, 2000, 4000, 8000, 16_000, 30_000]

/** The failure of a call that was held longer than `callHold`, which is never sent. */
const notSent = (hold: number): WireError => ({
  code: 'T0036',
  name: 'not-sent',
  message: `The call was held for want of a connection for ${Math.round(hold / 1000)} seconds, and was not sent.`,
  fix: 'Press again once the connection is back.',
})

/**
 * Takes what the page reaches. Answers the queue of its calls: a call that is made while the connection is gone
 * is held, not failed, and the held calls are sent in the order they were made when the connection is back - the
 * browser says it is online, or a try after 1, 2, 4 and up to 30 seconds goes through - so a later call never
 * overtakes an earlier one. A call held past `callHold` fails with T0036, and is never sent.
 */
export function callQueue(reach: QueueReach): Queue {
  const held: Held[] = []
  let next = 0
  let cancel: (() => void) | undefined
  let flushing = false

  const later = (): void => {
    cancel?.()
    const ms = tries[Math.min(next, tries.length - 1)] ?? 30_000
    next += 1
    cancel = reach.wait(() => {
      cancel = undefined
      void flush()
    }, ms)
  }

  /** Sends the held calls in their order, until one fails as the network's again. */
  const flush = async (): Promise<void> => {
    if (flushing) return
    flushing = true
    try {
      while (held.length) {
        const first = held[0]
        if (!first) break
        first.sending = true
        try {
          const value = await first.send()
          held.shift()
          first.waiting(false)
          first.done(value)
        } catch (error) {
          first.sending = false
          if (isNetwork(error)) {
            later()
            return
          }
          held.shift()
          first.waiting(false)
          first.failed(error)
        }
      }
      next = 0
    } finally {
      flushing = false
    }
  }
  const back = (): void => {
    next = 0
    void flush()
  }
  reach.online?.(back)

  /** Holds a call, and fails it with T0036 once it was held for `callHold`, unless it is being sent then. */
  const hold = (one: Held): void => {
    held.push(one)
    one.waiting(true)
    const expire = (): void => {
      const at = held.indexOf(one)
      if (at < 0) return
      if (one.sending) return void reach.wait(expire, 250)
      held.splice(at, 1)
      one.waiting(false)
      one.failed(notSent(reach.hold))
    }
    reach.wait(expire, Math.max(0, one.made + reach.hold - reach.now()))
    if (!cancel && !flushing) later()
  }

  return {
    send: (work, waiting) =>
      new Promise((done, failed) => {
        const one: Held = { send: work, done, failed, waiting, made: reach.now(), sending: false }
        // A later call never overtakes one that is held.
        if (held.length) return hold(one)
        work().then(done, (error: unknown) => (isNetwork(error) ? hold(one) : failed(error)))
      }),
    holds: () => held.length > 0,
    back,
  }
}
