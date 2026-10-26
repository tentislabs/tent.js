// Loaded first into the program of each test file of an app under `tent test`, before any module of the engine:
// the `Date` and the `Math.random` that every module finds are these. The code of a call of a test app reads the
// clock and the source of numbers of that app, which the engine tells by a name on the global object once it loads;
// the test's own code, the runner and every program without a test app read the runtime's own.

/** What the code of a call under way reads: the clock and the source of its app. */
interface Chance {
  now(): number
  random(): number
}

const isChance = (value: unknown): value is Chance =>
  typeof Reflect.get(Object(value), 'now') === 'function' && typeof Reflect.get(Object(value), 'random') === 'function'

const RealDate = Date
const realRandom = Math.random

/** What the code under way reads, where it is the code of a call of an app with a source of its own. */
function chanceNow(): Chance | undefined {
  const ask: unknown = Reflect.get(globalThis, Symbol.for('tent.chance'))
  const told: unknown = typeof ask === 'function' ? Reflect.apply(ask, undefined, []) : undefined
  return isChance(told) ? told : undefined
}

const now = (): number => chanceNow()?.now() ?? RealDate.now()

// A date made with no value is now by that clock, and `Date()` called alone tells that moment; one made from a
// number, a text or its parts is the runtime's own.
globalThis.Date = new Proxy(RealDate, {
  construct: (made, given, target) => Reflect.construct(made, given.length ? given : [now()], target),
  apply: () => new RealDate(now()).toString(),
  get: (made, key, receiver) => (key === 'now' ? now : Reflect.get(made, key, receiver)),
})
Math.random = () => chanceNow()?.random() ?? realRandom()
