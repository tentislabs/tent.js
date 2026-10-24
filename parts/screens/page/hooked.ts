// The name under which a test that drives a page lays its record into the page, before the scripts of the page: the
// page code of a page in the mode `test` looks for it, and gives it what the test reads.
export const testHook = Symbol.for('tent.test')

/** Whether a test that drives this page laid its record into it. */
export const isTested = (): boolean => {
  const hook: unknown = Reflect.get(globalThis, testHook)
  return typeof hook === 'object' && hook !== null
}
