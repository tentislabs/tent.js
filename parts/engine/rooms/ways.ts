import { TentError } from '../../core/index.ts'
import { isInherited } from '../../core/internal.ts'
import { outsideCalls, within } from '../context.ts'
import { slot } from '../slot.ts'
import { intoOf, outOf, rowsOut } from './callables.ts'
import type { OpenCall } from './calls.ts'
import { askerOf, boundsOf, callsOf, keeperOf } from './calls.ts'
import type { Room, Ways } from './room.ts'

/**
 * The work of one way, inside the call it was asked for, in what the engine was in where it opened the call. A way
 * that the code of the call the engine waits on at once asked is carried out where the engine is now, as the step of
 * a branch of `step.all`; and what a maker made is used in the call that uses it now.
 */
const inCall = <Answer>(open: OpenCall, work: () => Answer, atOnce: boolean): Answer => {
  if (open.kept && !open.cx) return work()
  const called = (): Answer => (open.cx ? within(open.cx, work) : outsideCalls(work))
  return atOnce ? called() : open.inside(called)
}

// The values that a word draws from the engine.
const drawn = ['now', 'random', 'token', 'zone', 'mayWait', 'valueSize'] as const

/** Whether a member of a handle is a record that is read on, as a secret with its `reveal`: one that holds work. */
const holdsWork = (at: unknown): boolean =>
  typeof at === 'object' &&
  at !== null &&
  !Array.isArray(at) &&
  Object.values(at).some((one) => typeof one === 'function')

/**
 * Walks a working object of a handle along a path of members, none of them a name it only inherits - its
 * `constructor`, `__proto__`, or what the runtime gives every value - as `core` holds such a name to be no member.
 * Answers the member and what holds it, or nothing where a name of the path is no member of what it reads.
 */
function memberAt(working: object, path: string[]): { at: unknown; holder: unknown } | undefined {
  let holder: unknown
  let at: unknown = working
  for (const name of path) {
    if (!((typeof at === 'object' && at !== null) || typeof at === 'function') || isInherited(at, name))
      return undefined
    holder = at
    at = Reflect.get(at, name)
  }
  return { at, holder }
}

/** The columns of the table that a plan reads, where it reads one table alone and the call knows its app. */
function columnsOf(open: OpenCall, plan: unknown): Record<string, unknown> | undefined {
  const from: unknown = Reflect.get(Object(plan), 'from')
  if (typeof from !== 'string' || Reflect.get(Object(plan), 'with') !== undefined) return undefined
  const tables = open.cx?.app.description.tables
  const table = tables && Object.hasOwn(tables, from) ? tables[from] : undefined
  const columns: unknown = Reflect.get(Object(table), 'columns')
  return typeof columns === 'object' && columns !== null ? Object(columns) : undefined
}

/**
 * The runtime slot of `core`, as a word reaches it in the program, for a word that crossed: a call, a start, an
 * event, a value that is drawn, and a handle, whose members are read one at a time by their path, and called.
 */
function runtimeWord(word: string, args: unknown[]): unknown {
  switch (word) {
    case 'call':
      return slot.call(String(args[0]), Array.isArray(args[1]) ? args[1] : [])
    case 'start':
      return slot.start(String(args[0]), args[1])
    case 'emit':
      return slot.emit(String(args[0]), args[1])
    case 'draw': {
      const asked = drawn.find((one) => one === args[0])
      if (asked === undefined) throw new TentError('T0013', 'The room asked for a value that no word draws.')
      return slot.draw(asked, Array.isArray(args[1]) ? args[1] : [])
    }
    case 'handle': {
      const [name, path, how, handed] = args
      const names = Array.isArray(path) ? path.map(String) : []
      const found = memberAt(slot.handle(String(name)), names)
      if (how === 'call') {
        if (typeof found?.at !== 'function') throw new TypeError(`${[name, ...names].join('.')} is not a function`)
        return Reflect.apply(found.at, found.holder, Array.isArray(handed) ? handed : [])
      }
      // A name the working object does not hold of its own is no member: nothing of what it inherits is read.
      if (!found) return { member: 'value', value: undefined }
      const { at } = found
      // A member is told by what it is: a function is called by its path, a record is read on, a value is copied.
      if (typeof at === 'function') return { member: 'fn' }
      if (holdsWork(at)) return { member: 'record' }
      return { member: 'value', value: at }
    }
  }
  throw new TentError('T0013', `The room asked the runtime for a word it does not give: ${word.slice(0, 40)}.`)
}

/**
 * Takes what answers the room once it is made. Answers the engine's side of `ways`: each member finds its call by
 * its number, takes what it was handed into this heap, carries it out as the same call reaches it in the program -
 * the runtime slot, the `db` it was handed, a function it was handed, the wrap of `fetch` - and answers it as it
 * crosses. A promise the engine kept, asked for by its number below zero, is answered once it is settled.
 */
export function waysOf(roomOf: () => Room): Ways {
  const crossing = (call: number) => {
    const room = roomOf()
    const open = callsOf(room).find(call)
    const asker = askerOf(room, call)
    const out = (value: unknown): unknown => outOf(value, keeperOf(room, call), boundsOf(open.cx))
    return { open, into: (value: unknown) => intoOf(value, asker), out, atOnce: callsOf(room).isAtOnce() }
  }
  return {
    runtime(call, word, args) {
      const { open, into, out, atOnce } = crossing(call)
      const handed = into(args)
      return out(inCall(open, () => runtimeWord(word, Array.isArray(handed) ? handed : []), atOnce))
    },
    db(call, db, member, args) {
      const { open, into, out, atOnce } = crossing(call)
      const members = open.dbs.get(db)
      if (!members) throw new TentError('T0013', 'The room asked for a `db` its call was not handed.')
      const handed = into(args)
      const values = Array.isArray(handed) ? handed : []
      const answer = inCall(open, () => Reflect.apply(members[member], members, values), atOnce)
      if (member !== 'read') return out(answer)
      // The rows of a read cross in the form the crossing chooses for their table.
      const keep = keeperOf(roomOf(), call)
      const columns = columnsOf(open, values[0])
      const rows = (value: unknown): unknown => rowsOut(value, columns, keep)
      return out(
        typeof Reflect.get(Object(answer), 'then') === 'function' ? Promise.resolve(answer).then(rows) : rows(answer),
      )
    },
    back(call, fn, args) {
      const { open, into, out, atOnce } = crossing(call)
      const kept = open.fns.get(Math.abs(fn))
      if (!kept) throw new TentError('T0013', 'The room asked for a function its call was not handed.')
      if (fn < 0) return Promise.resolve(kept()).then(out)
      const handed = into(args)
      return out(inCall(open, () => Reflect.apply(kept, undefined, Array.isArray(handed) ? handed : []), atOnce))
    },
    async fetch(call, request) {
      const { open, into, out, atOnce } = crossing(call)
      const asked = into(request)
      if (!(asked instanceof Request)) throw new TentError('T0013', 'The room asked to fetch what is no request.')
      return out(await inCall(open, () => globalThis.fetch(asked), atOnce))
    },
  }
}
