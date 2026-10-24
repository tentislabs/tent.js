import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import { fingerprintOf, isStored } from '../../core/internal.ts'
import { storedLimit } from '../limits.ts'
import type { Opened } from '../opened.ts'
import { table } from '../tables/once.ts'
import { callerText } from '../../data/index.ts'

const system = { kind: 'system' } as const

// The calls under way under an id, by the app: a second that arrives meanwhile waits for the first, and is not run.
const going = new WeakMap<object, Map<string, Promise<unknown>>>()

/**
 * Takes the value of the header `Idempotency-Key`, or of the id a page made for its call. Answers it as the id of
 * the call, or nothing where none was sent. Throws T0002 for one that is not 1 to 255 visible characters.
 */
export function callIdOf(given: string | null): string | undefined {
  if (given === null) return undefined
  if (!/^[\x21-\x7e]{1,255}$/.test(given))
    throw new TentError('T0002', 'An Idempotency-Key is 1 to 255 visible characters.', {
      fields: { 'idempotency-key': 'text' },
      fix: 'Send a key that a program made for this one call, as 22 random letters and digits.',
    })
  return given
}

/** The fingerprint of a call by its function and its input, which a call sent again with the same id must match. */
const printOf = (name: string, given: unknown): string =>
  fingerprintOf(new TextEncoder().encode(`${name}\n${JSON.stringify(given) ?? ''}`)).slice(0, 32)

/**
 * Takes an app, a change or an action by its name with its input, its caller, the
 * id the call carries, and what carries it out. Carries it out once for the caller and the id: the answer of a
 * call that ran is kept with the id in `_t_once` for `limits.callIdKeep`, and a call sent again with that id
 * is answered with it and not run again; one that arrives while the first is under way waits for it. A call that
 * failed keeps nothing, and is run when it is sent again. Throws T0002 for an id that came with another call.
 */
export function keptCall(
  o: Opened,
  call: { name: string; given: unknown; caller: Caller; id: string },
  run: () => unknown,
): unknown {
  const whose = callerText(call.caller)
  const key = `${whose}\n${call.id}`
  const all = going.get(o.handles) ?? new Map<string, Promise<unknown>>()
  going.set(o.handles, all)
  const under = all.get(key)
  if (under) return under.then(() => keptCall(o, call, run))
  const print = printOf(call.name, call.given)
  const now = o.clock.now()
  const held: unknown = o.store.read(
    { from: table.name, one: 'get', id: { caller: whose, key: call.id } },
    system,
  ).value
  const fresh = isStored(held) && held.at instanceof Date && held.at.getTime() >= now - keepOf(o)
  if (isStored(held) && fresh) {
    const answer = isStored(held.result) ? held.result : {}
    if (answer.name !== call.name || answer.input !== print)
      throw new TentError(
        'T0002',
        `The Idempotency-Key ${JSON.stringify(call.id).slice(0, 80)} came with another call.`,
        {
          fields: { 'idempotency-key': 'once' },
          fix: 'Send a new key for each new call, and the same key only with the same call sent again.',
        },
      )
    return answer.value
  }
  const kept = (value: unknown): unknown => {
    const text = JSON.stringify(value)
    const result = { name: call.name, input: print, ...(text === undefined ? {} : { value: JSON.parse(text) }) }
    const row = { result, run: '', at: new Date(o.clock.now()) }
    o.store.write((tx) =>
      held
        ? tx.change(table.name, { caller: whose, key: call.id }, row, system)
        : tx.add(table.name, { caller: whose, key: call.id, ...row }, system),
    )
    return value
  }
  const answer = run()
  if (!(answer instanceof Promise)) return kept(answer)
  const done = answer.then(kept)
  all.set(
    key,
    done.catch(() => undefined),
  )
  const left = (): void => void all.delete(key)
  done.then(left, left)
  return done
}

/** How long the id of a call is kept, in milliseconds. */
const keepOf = (o: Opened): number => storedLimit(o.description, 'callIdKeep')

/** Removes the ids of calls that were kept longer than `limits.callIdKeep`. */
export function sweepCallIds(o: Opened): void {
  const before = new Date(o.clock.now() - keepOf(o))
  // The ids of calls are the rows of no run and of no call coming in; a call inside a step is kept with its run.
  const where = {
    all: [
      { col: 'run', is: '' },
      { col: 'at', below: before },
      {
        not: {
          any: [
            { col: 'caller', is: '' },
            { col: 'caller', startsWith: 'incoming:' },
          ],
        },
      },
    ],
  }
  const read = o.store.read({ from: table.name, where }, system).value
  const old = Array.isArray(read) ? read : []
  if (old.length)
    o.store.write((tx) => {
      for (const row of old) tx.remove(table.name, { caller: String(row.caller), key: String(row.key) }, system)
    })
}
