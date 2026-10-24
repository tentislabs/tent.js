import { TentError, table } from '../core/index.ts'
import type { Plan } from '../core/internal.ts'
import { answered } from './answered.ts'

/** A write of one row as `db` makes it: the values as the code handed them, and `of` as the plan of its table holds it. */
export type FaceWrite =
  | { add: string; of?: unknown; values: Record<string, unknown> }
  | { change: string; of?: unknown; id: unknown; values: Record<string, unknown> }
  | { remove: string; of?: unknown; id: unknown }

/**
 * The three members that carry out what `db` makes: a plan read, a list of writes, and a raw text. `full` says that
 * it was made through `db.system`. Each answers at once, or a promise where the `db` is one that waits.
 */
export interface DbMembers {
  read(plan: Plan, full: boolean): unknown
  write(writes: FaceWrite[], full: boolean): unknown
  sql(text: string, values: unknown[], o: { of?: string }): unknown
}

/** How a face is made: its tables, whether it waits, and whether the code has full access. */
export interface FaceOptions {
  tables: string[]
  // `async`: every answer is a promise, as an action's is.
  mode: 'read' | 'write' | 'async'
  // With full access the face has `db.system`, `db.sql` and `db.n`.
  full: boolean
  // Of a face with no full access, the definition whose code is refused `db.system`, `db.sql` and `db.n` by name.
  refused?: string
}

// The members and the options of each face that was made, so that a room that crosses hands on what made it.
const faces = new WeakMap<object, { members: DbMembers; options: FaceOptions }>()

/**
 * Takes a value. Answers the members and the options of the face of `db` it is, or stands on: a `db` limited to
 * its caller is made on the face with what refuses full access in front of it, which the options then name.
 */
export function faceOf(value: object): { members: DbMembers; options: FaceOptions } | undefined {
  const own = faces.get(value)
  if (own) return own
  const under: unknown = Object.getPrototypeOf(value)
  const found = typeof under === 'object' && under !== null ? faces.get(under) : undefined
  if (!found) return undefined
  // Only what refuses full access stands in front of the face: a `db` made on it with members of its own is another.
  const names = Object.getOwnPropertyNames(value)
  const refuses = names.length > 0 && names.every((name) => ['system', 'sql', 'n'].includes(name))
  return refuses ? { members: found.members, options: { ...found.options, full: false } } : undefined
}

// The members of a plan that each answer a new plan.
const members = [
  'where',
  'search',
  'group',
  'with',
  'near',
  'rank',
  'newest',
  'oldest',
  'sort',
  'limit',
  'skip',
  'after',
  'pick',
]

// Each chain that a face made, with the plan of `core` it stands for: a chain inside a filter is read as that plan.
const plans = new WeakMap<object, object>()

/** A value as it was written, with each chain of a `db` inside it as the plan it stands for. */
function written(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(written)
  if (typeof value !== 'object' || value === null) return value
  const plan = plans.get(value)
  if (plan) return plan
  const made = Object.getPrototypeOf(value)
  return made === Object.prototype || made === null
    ? Object.fromEntries(Object.entries(value).map(([name, one]) => [name, written(one)]))
    : value
}

/** Calls a member of a plan of `core`, which answers the plan after it. */
function next(plan: object, name: string, args: unknown[] = []): object {
  const member: unknown = Reflect.get(plan, name)
  if (typeof member !== 'function') throw new TentError('T0009', `A plan has no member \`${name}\`.`)
  const made: unknown = Reflect.apply(member, plan, args.map(written))
  if (typeof made !== 'object' || made === null) throw new TentError('T0009', `\`${name}\` of a plan answered no plan.`)
  return made
}

/** The stored record of a plan of `core`. */
function recordOf(plan: object): Plan {
  const record: unknown = Reflect.get(plan, 'plan')
  if (typeof record !== 'object' || record === null || typeof Reflect.get(record, 'from') !== 'string')
    throw new TentError('T0009', 'A chain of db holds no plan.')
  return Object(record)
}

/** Works on what a member answered: at once, or once a promise of it is kept. */
const after = (value: unknown, then: (one: unknown) => unknown): unknown =>
  typeof Reflect.get(Object(value), 'then') === 'function' ? Promise.resolve(value).then(then) : then(value)

/** A name of a table as raw SQL writes it, between double quotes. */
const quoted = (name: string): string => `"${name.replaceAll('"', '""')}"`

/**
 * Takes the three members that carry out what `db` makes, and how the face is made. Answers the one face of `db`:
 * each table as a chain of a plan, its reads of one row and its writes, `of` for a tenant's file, and with full
 * access `db.system`, `db.sql` and `db.n`. Every read hands `read` a plan, every write hands `write` a list of one,
 * and raw SQL hands `sql` its text: each answers at once in a query and a change, and a promise in an action.
 */
export function dbFace(m: DbMembers, o: FaceOptions): Record<string, unknown> {
  const waits = o.mode === 'async'
  const tablesOf = (full: boolean): Record<string, unknown> => {
    const run = (asked: object): unknown => answered(waits, () => m.read(recordOf(asked), full))
    const chain = (plan: object): Record<string, unknown> => {
      const made: Record<string, unknown> = {
        all: () => run(plan),
        first: () => run(next(plan, 'first')),
        count: () => run(next(plan, 'count')),
      }
      for (const name of members) made[name] = (...args: unknown[]) => chain(next(plan, name, args))
      plans.set(made, plan)
      return made
    }
    const one = (writes: FaceWrite[]): unknown => after(m.write(writes, full), (rows) => Reflect.get(Object(rows), 0))
    const tableOf = (start: object): object => {
      const { from: name, of } = recordOf(start)
      const at = of === undefined ? {} : { of }
      return Object.assign(chain(start), {
        get: (id: unknown) => run(next(start, 'get', [id])),
        count: (filter?: unknown) => run(next(start, 'count', filter === undefined ? [] : [filter])),
        history: (id: unknown) => run(next(start, 'history', [id])),
        of: (tenant: unknown) => tableOf(next(start, 'of', [tenant])),
        add: (values: Record<string, unknown>) => one([{ add: name, ...at, values }]),
        change: (id: unknown, values: Record<string, unknown>) => one([{ change: name, ...at, id, values }]),
        remove: (id: unknown) => after(m.write([{ remove: name, ...at, id }], full), () => undefined),
      })
    }
    const db: Record<string, unknown> = {}
    for (const name of o.tables) {
      let made: object | undefined
      Object.defineProperty(db, name, {
        enumerable: true,
        get: () => {
          made ??= tableOf(table(name, {}))
          return made
        },
      })
    }
    return db
  }
  const db = tablesOf(false)
  faces.set(db, { members: m, options: o })
  if (o.refused !== undefined) {
    const name = o.refused
    for (const member of ['system', 'sql', 'n'])
      Object.defineProperty(db, member, {
        get(): never {
          throw new TentError(
            'T0013',
            `${name} used \`db.${member}\`, which is full access, and states no \`system\`.`,
            {
              fix: "State `system: 'why'` on the definition, with the reason it needs full access.",
            },
          )
        },
      })
  }
  if (!o.full) return db
  db.system = tablesOf(true)
  const sql = (text: string, values: unknown[] = [], how: { of?: string } = {}): unknown =>
    m.sql(text, values, how.of === undefined ? {} : { of: how.of })
  db.sql = (text: string, values?: unknown[], how?: { of?: string }) => answered(waits, () => sql(text, values, how))
  db.n = (name: string, id: string) =>
    answered(waits, () =>
      after(sql(`SELECT "_n" FROM ${quoted(name)} WHERE "id" = ?`, [id]), (rows) => {
        const row: unknown = Array.isArray(rows) ? rows[0] : undefined
        if (row === undefined)
          throw new TentError('T2103', `No row of \`${name}\` is found under the id ${JSON.stringify(id)}.`)
        return Number(Reflect.get(Object(row), '_n'))
      }),
    )
  return db
}
