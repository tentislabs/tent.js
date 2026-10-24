import type { Stored } from '../record.ts'
import { isStored } from '../record.ts'
import type { Tick } from '../word.ts'

/**
 * What carries out the three things a sequence of an agent may hold beside a body's own. `at` is the place of
 * the call, which `runBody` counts: one counter over the sequence, and inside an `all` the place of the entry and a
 * counter of that entry.
 */
export interface SequenceDoors {
  tool(name: string, input: unknown, at: number[]): unknown
  fill(shape: object, prompt: string, at: number[]): unknown
  all(list: unknown[], entry: (i: number) => unknown, at: number[]): unknown
  // Told the line of each statement of the sequence as it is reached, which an error of the sequence names.
  line?(n: number): void
}

/** Where a sequence stands while it is carried out: its doors, the place of the entry it is in, and its counter. */
export interface InSequence {
  doors: SequenceDoors
  at: number[]
  count: { n: number }
}

/** The place of the next call of a sequence. */
const nextAt = (s: InSequence): number[] => [...s.at, ++s.count.n]

/** A call of a tool of a sequence, through its door. */
export const toolDoor = (s: InSequence, name: string, input: unknown): unknown =>
  s.doors.tool(name, input ?? {}, nextAt(s))

const isPromise = (value: unknown): value is PromiseLike<unknown> =>
  typeof value === 'object' && value !== null && typeof Reflect.get(value, 'then') === 'function'

/** `each` in a sequence: an arrow that waits takes the entries one after another, so that the places of its calls follow the list. */
function eachInOrder(tick: Tick, list: unknown, arrow: unknown): unknown {
  if (!Array.isArray(list)) throw new TypeError('each is handed a value that is no list')
  if (typeof arrow !== 'function') throw new TypeError('each is handed no arrow')
  const made: unknown[] = []
  for (let i = 0; i < list.length; i++) {
    tick?.()
    const one: unknown = Reflect.apply(arrow, undefined, [list[i], i])
    if (isPromise(one))
      return (async () => {
        made.push(await one)
        for (let j = i + 1; j < list.length; j++) {
          tick?.()
          made.push(await Reflect.apply(arrow, undefined, [list[j], j]))
        }
        return made
      })()
    made.push(one)
  }
  return made
}

/** A word that a sequence carries out in its own way: `fill` through its door, and `each` in the order of its list. */
export function wordDoor(s: InSequence, name: string, args: unknown[], tick: Tick): unknown {
  if (name === 'each') return eachInOrder(tick, args[0], args[1])
  const [shape, prompt] = args
  if (typeof shape !== 'object' || shape === null) throw new TypeError('fill is handed no shape')
  return s.doors.fill(shape, String(prompt), nextAt(s))
}

/** What an entry of an `all` that goes on past a failure answers in its place, unless the failure ends the sequence. */
function goneOn(failure: unknown): unknown {
  if (Reflect.get(Object(failure), 'endsSequence') === true) throw failure
  const code: unknown = Reflect.get(Object(failure), 'code')
  const message: unknown = Reflect.get(Object(failure), 'message')
  return { failed: true, code: typeof code === 'string' ? code : 'T0009', message: String(message ?? '') }
}

/**
 * Takes the stored `all`, the list and the options it was handed, and what makes the function of an arrow for one
 * entry where it stands. Answers what the door of `all` answers: each entry runs its arrow with the place of the
 * entry and a counter of its own, and with `goOn` a failed entry answers `{ failed: true, code, message }`.
 */
export function allDoor(
  s: InSequence,
  node: Stored,
  list: unknown,
  options: unknown,
  arrowAt: (arrow: Stored, inner: InSequence) => (...args: unknown[]) => unknown,
): unknown {
  if (!Array.isArray(list)) throw new TypeError('all is handed a value that is no list')
  const arrow: unknown = Array.isArray(node.args) ? node.args[1] : undefined
  if (!isStored(arrow)) throw new TypeError('all is handed no arrow')
  const goOn = Reflect.get(Object(options), 'goOn') === true
  const at = nextAt(s)
  const entry = (i: number): unknown => {
    const run = arrowAt(arrow, { doors: s.doors, at: [...at, i + 1], count: { n: 0 } })
    const made = Promise.resolve().then(() => run(list[i], i))
    return goOn ? made.catch(goneOn) : made
  }
  return s.doors.all(list, entry, at)
}
