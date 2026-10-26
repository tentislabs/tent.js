import { seededSource } from '../engine/index.ts'

/**
 * What each document of a page that a test opens runs before its own scripts, handed how far the clock of the app
 * stands ahead of the time of the system, and a seed with the text of the source of numbers made from it. It lays the
 * record of the test into the page, under the name the page code looks for: the page code of a page in the mode
 * `test` gives it what a test reads, and a page of the engine's own, which holds no page code, gives nothing once it
 * has loaded. The time of the page runs as the clock of the app does, so that `app.clock.advance` moves the pages
 * too, and where a seed is handed, `Math.random` and the random values of `crypto`, which the ids of its calls are
 * made of, are drawn from it. The function is sent to the browser as its text: it names nothing outside itself.
 */
function preloaded(ahead: number, seed?: string, source?: (seed: string) => () => number): void {
  const name = Symbol.for('tent.test')
  if (Reflect.get(globalThis, name) !== undefined) return
  const Real = Date
  let moved = ahead
  const now = (): number => Real.now() + moved
  // A date made with no value is now by the clock of the app, and `Date()` called alone tells that moment.
  const Moved = new Proxy(Real, {
    construct: (made, given) => Reflect.construct(made, given.length ? given : [now()]),
    apply: () => new Real(now()).toString(),
    get: (made, key) => (key === 'now' ? now : Reflect.get(made, key)),
  })
  Reflect.set(globalThis, 'Date', Moved)
  if (seed !== undefined && source) {
    const random = source(seed)
    Math.random = random
    if (globalThis.crypto)
      Reflect.defineProperty(globalThis.crypto, 'getRandomValues', {
        value: <Values extends ArrayBufferView>(values: Values): Values => {
          const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength)
          for (let k = 0; k < bytes.length; k++) bytes[k] = Math.floor(random() * 256)
          return values
        },
        configurable: true,
      })
  }
  let give = (_tested: unknown): void => undefined
  const hook: { ready: Promise<unknown>; tested?: unknown; give(tested: unknown): void; move(to: number): void } = {
    ready: new Promise((done) => {
      give = done
    }),
    give(tested) {
      hook.tested = tested
      give(tested)
    },
    move(to) {
      moved = to
      dispatchEvent(new Event('tent-clock'))
    },
  }
  Reflect.set(globalThis, name, hook)
  addEventListener('load', () => {
    if (!document.querySelector('body > script#tent-page')) give(null)
  })
}

/** The text that a page of a test runs first, with the clock of the app as far ahead as it stands now, and its seed. */
export const preloadText = (ahead: number, seed?: string): string =>
  seed === undefined
    ? `() => (${String(preloaded)})(${JSON.stringify(ahead)})`
    : `() => (${String(preloaded)})(${JSON.stringify(ahead)}, ${JSON.stringify(seed)}, ${String(seededSource)})`
