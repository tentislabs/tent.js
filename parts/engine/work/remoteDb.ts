import type { Db } from '../../core/index.ts'
import { TentError, table } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'

// The members of a plan that each answer a new plan.
const members = [
  'where',
  'search',
  'group',
  'with',
  'near',
  'newest',
  'oldest',
  'sort',
  'limit',
  'skip',
  'after',
  'pick',
]

/** Calls a member of a plan of `core`, which answers the plan after it. */
function next(plan: object, name: string, args: unknown[] = []): object {
  const member: unknown = Reflect.get(plan, name)
  if (typeof member !== 'function') throw new TentError('T0009', `A plan has no member \`${name}\`.`)
  const made: unknown = Reflect.apply(member, plan, args)
  if (typeof made !== 'object' || made === null) throw new TentError('T0009', `\`${name}\` of a plan answered no plan.`)
  return made
}

/** The stored record of a plan of `core`. */
const recordOf = (plan: object): unknown => Reflect.get(plan, 'plan')

/** The error of a write through the `db` of work on a worker: it writes by calling a change. */
const writes = (): never => {
  throw new TentError('T0013', 'Work on a worker writes by calling a change, and never through `db`.', {
    fix: 'Call a change from the work: the writer carries it out.',
  })
}

/**
 * Takes a description, and what reads a stored plan through the writer. Answers the `db` of work on a worker:
 * each table and each plan as in an action, and every read a promise of what the writer answered for it.
 */
export function remoteDb(description: Description, read: (plan: unknown) => Promise<unknown>): Db
export function remoteDb(description: Description, read: (plan: unknown) => Promise<unknown>): object {
  const chain = (plan: object): Record<string, unknown> => {
    const run = (asked: object): Promise<unknown> => read(recordOf(asked))
    const made: Record<string, unknown> = {
      all: () => run(plan),
      first: () => run(next(plan, 'first')),
      count: () => run(next(plan, 'count')),
    }
    for (const name of members) made[name] = (...args: unknown[]) => chain(next(plan, name, args))
    return made
  }
  const tableOf = (start: object): object => {
    const run = (asked: object): Promise<unknown> => read(recordOf(asked))
    return Object.assign(chain(start), {
      get: (id: unknown) => run(next(start, 'get', [id])),
      count: (filter?: unknown) => run(next(start, 'count', filter === undefined ? [] : [filter])),
      history: (id: unknown) => run(next(start, 'history', [id])),
      of: (tenant: unknown) => tableOf(next(start, 'of', [tenant])),
      add: writes,
      change: writes,
      remove: writes,
    })
  }
  const db: Record<string, unknown> = {}
  for (const name of Object.keys(description.tables)) {
    let made: object | undefined
    Object.defineProperty(db, name, {
      enumerable: true,
      get: () => {
        made ??= tableOf(table(name, {}))
        return made
      },
    })
  }
  db.read = (plan: unknown) => read(plan)
  db.write = writes
  return db
}
