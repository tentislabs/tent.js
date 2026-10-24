import type { ChangeDb } from '../db.ts'
import { mark } from '../mark.ts'
import type { Write } from '../plan.ts'
import type { SystemCall } from '../words/shared.ts'

/** The starter data of a project: a list of writes, or an arrow that makes them. */
interface Seed {
  seed: readonly Write[] | ((o: { db: ChangeDb; call: SystemCall; now: Date }) => unknown)
}

/**
 * Takes the starter data of a project: a list of writes, or an arrow that is handed a `db` with full access,
 * `call` and `now`, and may be async. Answers the record of it, which the file of the starter data exports as its
 * default.
 */
export function seed(data: Seed['seed']): Seed {
  return mark({ seed: data })
}
