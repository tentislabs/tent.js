// What a `db` answers: at once, or as a promise for a `db` that waits, as an action's does.

/**
 * Takes whether the answer waits, and the work that gives it. Answers what the work gives at once, or a promise of
 * it where the answer waits: a promise that also carries what the work threw at once.
 */
export function answered(waits: boolean, work: () => unknown): unknown {
  if (!waits) return work()
  try {
    return Promise.resolve(work())
  } catch (error) {
    return Promise.reject(error)
  }
}
