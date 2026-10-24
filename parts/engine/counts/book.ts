import { fingerprint } from '../../core/index.ts'
import type { StorePlan, Tx } from '../../data/index.ts'
import type { Opened } from '../opened.ts'
import { table } from '../tables/counts.ts'

const system = { kind: 'system' } as const

/** One amount to book: the day, what was used and what answered, the caller as a column keeps one, the unit. */
export interface Booked {
  day: Date
  name: string
  answeredBy: string
  caller: string
  user?: string
  unit: string
  amount: number
  // A level whose row holds the highest amount, which is never added.
  peak?: true
}

/** The id of the row of a key: the same for the same key, so that `get` finds the row it is booked into. */
const idOf = (one: Booked): string =>
  fingerprint([one.day.toISOString(), one.name, one.answeredBy, one.caller, one.unit].join('\n')).slice(0, 25)

// The people removed from each app since it opened, kept in memory alone: what reaches the counts for them after
// their removal, as a reader's batch may, is booked under `removed`.
const removedOf = new WeakMap<Opened, Set<string>>()

/** Is told a person who is removed from an app: from now on a count for them names them nowhere. */
export function countsRemoved(o: Opened, user: string): void {
  const removed = removedOf.get(o) ?? new Set()
  removed.add(user)
  removedOf.set(o, removed)
}

/** The amounts to book, where an amount of a removed person who has no row in `users` is booked under `removed`. */
function stillThere(o: Opened, tx: Tx, amounts: Booked[]): Booked[] {
  const removed = removedOf.get(o)
  if (!removed?.size) return amounts
  const gone = (user: string): boolean =>
    removed.has(user) && (tx.read({ from: 'users', one: 'get', id: user }, system) ?? undefined) === undefined
  return amounts.map((one) => {
    if (one.user === undefined || !gone(one.user)) return one
    const { user: _, ...rest } = one
    return { ...rest, caller: 'removed' }
  })
}

/**
 * Takes an app, an open write and the amounts to book. Adds each amount to the row of its day, thing, caller and
 * unit, or writes the higher of the two for a peak, and makes the row where there is none.
 */
export function book(o: Opened, tx: Tx, given: Booked[]): void {
  const now = new Date(o.clock.now())
  for (const one of stillThere(o, tx, given)) {
    if (!Number.isFinite(one.amount)) continue
    const key = { day: one.day, name: one.name, answeredBy: one.answeredBy, caller: one.caller, unit: one.unit }
    const held: unknown = tx.read({ from: table.name, one: 'get', id: key }, system)
    const was: unknown = Reflect.get(Object(held), 'amount')
    if (typeof was === 'number') {
      const amount = one.peak ? Math.max(was, one.amount) : was + one.amount
      if (amount !== was) tx.change(table.name, key, { amount, updatedAt: now }, system)
    } else
      tx.add(
        table.name,
        {
          id: idOf(one),
          ...key,
          ...(one.user ? { user: one.user } : {}),
          amount: one.amount,
          createdAt: now,
          updatedAt: now,
        },
        system,
      )
  }
}

/**
 * Takes an app and a plan's filter over the counts of one day. Answers the sum of each unit of the rows that fit,
 * read as the system.
 */
export function summed(o: Opened, where: StorePlan['where']): Record<string, number> {
  const read: unknown = o.store.read({ from: table.name, ...(where ? { where } : {}) }, system).value
  const sums: Record<string, number> = {}
  for (const row of Array.isArray(read) ? read : []) {
    const unit = String(Reflect.get(Object(row), 'unit'))
    const amount: unknown = Reflect.get(Object(row), 'amount')
    if (typeof amount === 'number') sums[unit] = (sums[unit] ?? 0) + amount
  }
  return sums
}
