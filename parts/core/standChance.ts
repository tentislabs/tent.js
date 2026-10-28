// The moment of the runtime's own clock, as this heap had it when core loaded, before anything stood in its place:
// a clock that the code of a call reads through the stood-in `Date` reads the time of the system here.
const ownNow = Date.now

/** The time of the system in milliseconds, as the runtime tells it, whatever stands in place of `Date`. */
export const systemNow = (): number => ownNow()

/**
 * Takes what tells the moment and the number that the code under way reads, each nothing where that code reads the
 * runtime's own. Stands a `Date` and a `Math.random` in place of those of this heap: a date made with no value is
 * now by that moment, and `Date()` called alone tells it; one made from a number, a text or its parts is the
 * runtime's own. So the held clock and the random seed of a test app reach the code of its calls, wherever it runs.
 */
export function standChance(nowOf: () => number | undefined, randomOf: () => number | undefined): void {
  const OwnDate = globalThis.Date
  const ownRandom = Math.random
  const now = (): number => nowOf() ?? OwnDate.now()
  globalThis.Date = new Proxy(OwnDate, {
    construct: (made, given, target) => Reflect.construct(made, given.length ? given : [now()], target),
    apply: () => new OwnDate(now()).toString(),
    get: (made, key, receiver) => (key === 'now' ? now : Reflect.get(made, key, receiver)),
  })
  Math.random = () => randomOf() ?? ownRandom()
}
