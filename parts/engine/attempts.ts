import { later, TentError } from '../core/index.ts'
import type { CallContext } from './context.ts'
import type { Opened } from './opened.ts'
import { table } from './tables/attempts.ts'
import { visit } from './visit.ts'
import { countedAs } from './web/names.ts'
import { plainAddress } from './web/proxy.ts'

const system = { kind: 'system' } as const

// When the window of each count that this program wrote ends, by the key of its row. The table holds no length:
// a count is judged by the length that its next try states, and removed by this once its window has ended.
const ends = new WeakMap<Opened, Map<string, number>>()

const endsOf = (o: Opened): Map<string, number> => {
  let held = ends.get(o)
  if (!held) {
    held = new Map()
    ends.set(o, held)
  }
  return held
}

/** The two columns that name one count: the key, and the address, or an empty text for the key alone. */
interface Counted {
  key: string
  address: string
}

const nameOf = (one: Counted): string => JSON.stringify([one.key, one.address])

/**
 * What a count is kept for: the key, and with `address: true` the address of the request that is being answered,
 * an address of the newer kind by its first 64 bits. Where no request is being answered, the key alone.
 */
function countedFor(member: string, key: unknown, how: unknown): Counted {
  if (typeof key !== 'string' || key === '')
    throw new TentError('T0002', `\`attempts.${member}\` takes a key: a text that names what is tried.`, {
      fields: { key: 'type' },
    })
  const from = Reflect.get(Object(how), 'address') === true ? visit()?.about.from : undefined
  return { key, address: from === undefined ? '' : countedAs(plainAddress(from)) }
}

/** Holds the handle to where a count is a write of its own. Throws T0013 in a query, a change and a rule. */
function ownWrite(cx: CallContext, member: string): void {
  const { kind } = cx.work
  if (kind === 'action' || kind === 'seed') return
  throw new TentError(
    'T0013',
    `\`attempts.${member}\` was used in a ${kind}: a count is a write of its own, made at once.`,
    {
      fix: 'Count a try in an action or a route: a count inside a change would be undone with the change.',
    },
  )
}

/**
 * `attempts.limit`: counts one try for a key, and fails with T0005 when more than `tries` were counted within
 * `per`. The window starts at the first try. The count is a write of its own, made at once, so a try whose call
 * fails afterwards still counts. Throws T0013 in a query and a change, and T0002 for a count or a length that is
 * none.
 */
export function limitAttempts(cx: CallContext, key: unknown, how: unknown): void {
  const o = cx.app
  ownWrite(cx, 'limit')
  const tries: unknown = Reflect.get(Object(how), 'tries')
  const per: unknown = Reflect.get(Object(how), 'per')
  const length = typeof per === 'string' ? later(new Date(0), per).getTime() : Number.NaN
  if (typeof tries !== 'number' || !Number.isInteger(tries) || tries < 1 || !(length > 0))
    throw new TentError(
      'T0002',
      '`attempts.limit` takes `tries`, a whole number of 1 or more, and `per`, a length of time.',
      { fix: "Hand it both, as `{ tries: 5, per: '10 minutes' }`.", fields: { tries: 'type', per: 'type' } },
    )
  const one = countedFor('limit', key, how)
  const now = o.clock.now()
  const held = o.store.read({ from: table.name, one: 'get', id: { ...one } }, system).value
  const row = typeof held === 'object' && !Array.isArray(held) ? held : undefined
  const started = row?.windowStart instanceof Date ? row.windowStart.getTime() : Number.NaN
  const running = row !== undefined && now < started + length
  const count = running ? Number(row.count) : 0
  if (count >= tries)
    throw new TentError('T0005', `More than ${tries} tries were counted for ${JSON.stringify(one.key).slice(0, 80)}.`, {
      fix: 'Try again when the window has ended.',
    })
  const values = running ? { count: count + 1 } : { windowStart: new Date(now), count: 1 }
  o.store.write((tx) =>
    row ? tx.change(table.name, { ...one }, values, system) : tx.add(table.name, { ...one, ...values }, system),
  )
  endsOf(o).set(nameOf(one), (running ? started : now) + length)
}

/** `attempts.clear`: empties the count of a key, as after a sign-in that worked. Throws T0013 in a query and a change. */
export function clearAttempts(cx: CallContext, key: unknown, how: unknown): void {
  const o = cx.app
  ownWrite(cx, 'clear')
  const one = countedFor('clear', key, how)
  const held = o.store.read({ from: table.name, one: 'get', id: { ...one } }, system).value
  if (held !== undefined) o.store.write((tx) => tx.remove(table.name, { ...one }, system))
  endsOf(o).delete(nameOf(one))
}

/** Removes each count whose window has ended. */
export function sweepAttempts(o: Opened): void {
  const now = o.clock.now()
  const held = endsOf(o)
  const over = [...held].filter(([, end]) => end <= now).map(([name]) => name)
  if (!over.length) return
  o.store.write((tx) => {
    for (const name of over) {
      const [key, address]: string[] = JSON.parse(name)
      if (tx.read({ from: table.name, one: 'get', id: { key, address } }, system) !== undefined)
        tx.remove(table.name, { key, address }, system)
      held.delete(name)
    }
  })
}
