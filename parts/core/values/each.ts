import { TentError } from '../errors.ts'
import type { Tick } from '../word.ts'
import { cannot, drawn, holdsReference, listOf, sized } from '../word.ts'

const isPromise = (value: unknown): value is PromiseLike<unknown> =>
  typeof value === 'object' && value !== null && 'then' in value && typeof value.then === 'function'

/** Takes the entries one after another from the first arrow that answered a promise on. */
async function oneAfterAnother(
  tick: Tick,
  entries: unknown[],
  arrow: (entry: unknown, i: number) => unknown,
  made: unknown[],
  first: PromiseLike<unknown>,
  at: number,
): Promise<unknown[]> {
  made.push(await first)
  for (let i = at + 1; i < entries.length; i++) {
    tick?.()
    made.push(await arrow(entries[i], i))
  }
  return made
}

/** `each` with the `tick` it asks once for each entry. */
export function eachWith(tick: Tick, ...values: unknown[]): unknown {
  const [list, arrow] = values
  if (holdsReference([list])) {
    throw new TentError('T1014', '`each` was handed a reference in the place of its list: it takes an arrow.', {
      fix: 'Use each in a body or in a view, which can hold an arrow. A form written with values cannot.',
    })
  }
  const entries = listOf('each', list)
  if (typeof arrow !== 'function') return cannot('each', arrow, 'an arrow')
  sized('each', entries.length)
  const call = (entry: unknown, i: number): unknown => Reflect.apply(arrow, undefined, [entry, i])
  const made: unknown[] = []
  for (const [i, entry] of entries.entries()) {
    tick?.()
    const one = call(entry, i)
    if (isPromise(one)) {
      if (drawn('mayWait', [])?.value === true) return oneAfterAnother(tick, entries, call, made, one, i)
      // The promise is left alone from here on, so its own failure must not end the program.
      Promise.resolve(one).catch(() => undefined)
      throw new TentError('T0013', 'An arrow handed to `each` answered a promise where waiting is not allowed.', {
        fix: 'Write the arrow so that it answers a value, or use each in an action or inside a step.',
      })
    }
    made.push(one)
  }
  return made
}

/**
 * Takes a list and an arrow, which is handed each entry and its place. Answers a new list of what the arrow gave,
 * in order. Where waiting is allowed and the arrow answers a promise, the entries are taken one after another and
 * it answers a promise of the list. Throws T0013 for an arrow that answers a promise where waiting is not allowed,
 * before it takes a second entry; T1014 where it is handed a reference in the place of its list; and T0027 for a
 * value that is no list.
 */
export function each<Entry, Made>(
  list: readonly Entry[],
  arrow: (entry: Entry, i: number) => Promise<Made>,
): Promise<Made[]>
export function each<Entry, Made>(list: readonly Entry[], arrow: (entry: Entry, i: number) => Made): Made[]
export function each(...values: unknown[]): unknown {
  return eachWith(undefined, ...values)
}
