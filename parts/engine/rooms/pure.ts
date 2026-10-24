import { TentError } from '../../core/index.ts'

/** The error of a query that reads a clock, draws a random number or reaches the network while it runs. */
export const notPure = (what: string): TentError =>
  new TentError('T4101', `A query ${what} while it ran: a query answers the same for the same data.`, {
    fix: 'Read the time from the `now` that the query is handed, and move what draws or reaches out into an action.',
  })

const refuse = (what: string) => (): never => {
  throw notPure(what)
}

const realDate = Date
const realRandom = Math.random

// A moment that is made from a number, a text or its parts is no clock: only the three ways of asking for the
// present moment fail.
const heldDate = new Proxy(realDate, {
  construct: (target, args, made) => (args.length ? Reflect.construct(target, args, made) : refuse('read the clock')()),
  apply: refuse('read the clock'),
  get: (target, name, receiver) => (name === 'now' ? refuse('read the clock') : Reflect.get(target, name, receiver)),
})

// How many queries stand in each other at the moment: the swap is made by the first and taken back by the last.
let running = 0
// The `fetch` of the heap while the swap is in place.
let fetching: typeof fetch | undefined

/**
 * Takes the `run` of a query, or the arrow of a rule. Carries it out with the clock and the random source of the
 * runtime swapped for ones that fail with T4101, and takes the swap back when it has ended, also where it failed.
 * That is safe because such work runs from start to finish with nothing else in between.
 */
export function pure<Answer>(work: () => Answer): Answer {
  if (running++ === 0) {
    globalThis.Date = heldDate
    Math.random = refuse('drew a random number')
    // The two members stand on the kind of `crypto`: one of its own on the thing itself hides them, and is taken away again.
    if (typeof globalThis.crypto === 'object')
      for (const name of ['getRandomValues', 'randomUUID'])
        Reflect.defineProperty(globalThis.crypto, name, { value: refuse('drew a random number'), configurable: true })
    // The heap the code runs in may hold no wrap of `fetch` of the engine's: the swap refuses it there too.
    fetching = typeof globalThis.fetch === 'function' ? globalThis.fetch : undefined
    if (fetching) globalThis.fetch = refuse('reached the network')
  }
  try {
    return work()
  } finally {
    if (--running === 0) {
      globalThis.Date = realDate
      Math.random = realRandom
      if (typeof globalThis.crypto === 'object')
        for (const name of ['getRandomValues', 'randomUUID']) Reflect.deleteProperty(globalThis.crypto, name)
      if (fetching) globalThis.fetch = fetching
      fetching = undefined
    }
  }
}

/** Answers a random number from the source of the runtime, also while the swap of a query is in place. */
export const drawRandom = (): number => realRandom()
