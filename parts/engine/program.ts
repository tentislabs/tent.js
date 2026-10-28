import type { Caller, Db } from '../core/index.ts'
import { TentError } from '../core/index.ts'
import { needsUsers, userCaller } from '../core/internal.ts'
import { createDb } from '../data/index.ts'
import type { CallContext } from './context.ts'
import type { Opened } from './opened.ts'
import { sealed } from './values/seal.ts'

/** Whom a program names as the caller of what it asks of an app: a caller, or the two that have a word. */
export type As = Caller | 'system' | 'nobody'

const kinds = ['user', 'key', 'mcp', 'system', 'nobody']

/** Whether a value is a caller: a record whose kind is one of the five. */
const isCaller = (value: unknown): value is Caller =>
  typeof value === 'object' && value !== null && kinds.includes(String(Reflect.get(value, 'kind')))

/** Answers the caller that a program named with `as`, and nobody where it named none. */
export function callerNamed(as: unknown): Caller {
  if (as === 'system') return { kind: 'system' }
  return isCaller(as) ? as : { kind: 'nobody' }
}

const system: Caller = { kind: 'system' }

/**
 * Takes an app, and whom a command of this computer named as the caller, in a word: `system`, `nobody`, or the id
 * of a user. Answers the caller: for an id, the user of that row of `users`, with the roles the row holds. Throws
 * T0014 where an id is named and the app has no `users` table, and T2103 for an id that names no row.
 */
export function callerWritten(o: Opened, who: string): Caller {
  if (who === 'system' || who === 'nobody') return { kind: who }
  needsUsers({ name: o.name, tables: o.description.tables })
  return userCaller(who, o.store.read({ from: 'users', one: 'get', id: who }, system).value)
}

/** The error of a member of an app that was handed something of another kind than it takes. */
export const notTaken = (member: string, takes: string): TentError =>
  new TentError('T0013', `\`app.${member}\` takes ${takes}.`, {
    fix: 'Hand it what a table gives: `orders.where({ ... })` for a plan, and `[orders.add({ ... })]` for writes.',
  })

/**
 * Takes an app, a caller, and the write to work in, or none for a `db` that reads. Answers the `db` of that
 * caller, as a program that holds the app is handed it: under the rules of the tables, and with full access for
 * the system alone.
 */
export function dbFor(
  o: Opened,
  caller: Caller,
  write?: Parameters<typeof createDb>[0],
  more: Parameters<typeof createDb>[5] = {},
): Db {
  return createDb(write ?? o.files ?? o.store, o.description, caller, write ? 'write' : 'read', o.rules, {
    system: caller.kind === 'system',
    now: () => o.clock.now(),
    ids: o.ids,
    ...sealed(o),
    ...more,
  })
}

// The signal of a read and a write of a program, which nothing ends: each runs from start to finish.
const never = new AbortController().signal

/**
 * Takes an app, a caller, and whether a program reads or writes. Answers what its work belongs to: a call of its
 * own, a read as a query and a write as a change, with one moment for the whole of it. So the arrow of a rule
 * finds there what it finds at the door: a setting, the moment of the call, and the guard of a query. `ends` is
 * the moment at which its time is up: the time of a call is one, over every pass of it.
 */
export function asCall(o: Opened, caller: Caller, member: 'read' | 'write', ends: number): CallContext {
  const kind = member === 'read' ? 'query' : 'change'
  const work = { name: `app.${member}`, kind, depth: 1, now: new Date(o.clock.now()), ends } as const
  return { app: o, version: o.version, caller, made: 0, signal: never, work }
}
