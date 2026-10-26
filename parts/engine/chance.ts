import { underWay } from './context.ts'

// Under `tent test` the program of the tests stands a `Date` and a `Math.random` of its own in place of the
// runtime's, before the engine loads, and asks here what the code of the call under way reads: the clock and the
// source of numbers of that call's app, where the app has a source of its own. It finds this by its name on the
// global object, since it loads no module of the engine.
Reflect.set(globalThis, Symbol.for('tent.chance'), (): { now(): number; random(): number } | undefined => {
  const cx = underWay()
  const random = cx?.app.random
  return cx && random ? { now: () => cx.app.clock.now(), random } : undefined
})
