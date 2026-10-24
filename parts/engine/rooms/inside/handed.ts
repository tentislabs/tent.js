import { TentError } from '../../../core/index.ts'
import { dbFace } from '../../../data/dbFace.ts'
import type { Asker, Bounds, Keeper } from '../callables.ts'
import { intoLater, intoOf, outOf } from '../callables.ts'
import type { Ways } from '../room.ts'

/** The ways of the room runtime: those of a room, and how a promise of the engine is asked for once it is settled. */
export interface InsideWays extends Ways {
  // `false` where no way answers at once, as across two programs: each answers a promise.
  sync?: false
  // Asks `back` for a promise of the engine, by its number below zero, without holding this heap while it waits.
  later?(call: number, fn: number): Promise<unknown>
}

// What the code of each call handed the engine, by the call and then by its number: the engine asks for it by `back`.
const kept = new Map<number, Map<number, (...args: unknown[]) => unknown>>()
let numbers = 0

/** What keeps what the code of a call hands the engine, each under a number of its own. */
export function keeperIn(call: number): Keeper {
  const fn = (one: (...args: unknown[]) => unknown): number => {
    const n = ++numbers
    const held = kept.get(call) ?? new Map()
    held.set(n, one)
    kept.set(call, held)
    return n
  }
  return {
    fn,
    promise(promise) {
      // Its failure is told to the engine when it asks for it, and so is not one that nothing waits for.
      Promise.resolve(promise).catch(() => undefined)
      return -fn(() => promise)
    },
    stream(stream) {
      const reader = stream.getReader()
      return fn(() => reader.read().then((read) => (read.done ? undefined : read.value)))
    },
    db: () => undefined,
  }
}

/** The function of a call that the engine asks for by its number: a promise below zero, to be settled. */
export function keptIn(call: number, fn: number): (...args: unknown[]) => unknown {
  const one = kept.get(call)?.get(Math.abs(fn))
  if (!one)
    throw new TentError('T0013', 'The engine asked the room for a function of a call that it does not hold.', {
      fix: 'A callable works while its call lasts.',
    })
  return one
}

/** Forgets what the code of a call handed the engine: the call has ended. */
export const forgetCall = (call: number): void => void kept.delete(call)

/**
 * Takes the ways of the room, one call, and the bounds of its values. Answers how this heap asks for what the
 * engine handed that call: a function by `back`, a promise once it is settled, a stream piece by piece, and a `db`
 * made as the one face of `db` over the three members of `ways.db`.
 */
export function askerIn(ways: InsideWays, call: number, bounds: Bounds): Asker {
  const out = (values: unknown[]): unknown[] => {
    const made = outOf(values, keeperIn(call), bounds)
    return Array.isArray(made) ? made : []
  }
  const later = (fn: number): Promise<unknown> =>
    ways.later ? ways.later(call, fn) : Promise.resolve().then(() => ways.back(call, fn, []))
  const asker: Asker = {
    fn: (n, args) => intoLater(ways.back(call, n, out(args)), asker),
    promise: async (n) => intoOf(await later(n), asker),
    pull: async (n) => {
      const piece = await asker.promise(n)
      return piece instanceof Uint8Array ? piece : undefined
    },
    db(mark) {
      const asked = (member: 'read' | 'write' | 'sql', args: unknown[]): unknown =>
        intoLater(ways.db(call, mark.n, member, out(args)), asker)
      return dbFace(
        {
          read: (plan, full) => asked('read', [plan, full]),
          write: (writes, full) => asked('write', [writes, full]),
          sql: (text, values, o) => asked('sql', [text, values, o]),
        },
        {
          tables: mark.tables,
          mode: mark.mode,
          full: mark.full,
          ...(mark.refused === undefined ? {} : { refused: mark.refused }),
        },
      )
    },
  }
  return asker
}
