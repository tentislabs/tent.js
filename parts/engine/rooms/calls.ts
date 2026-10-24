import { AsyncLocalStorage } from 'node:async_hooks'
import { TentError } from '../../core/index.ts'
import type { DbMembers } from '../../data/index.ts'
import { faceOf, handAgain, keptAs } from '../../data/index.ts'
import type { CallContext } from '../context.ts'
import { underWay } from '../context.ts'
import { limitOf } from '../limits.ts'
import type { Asker, Bounds, Keeper } from './callables.ts'
import { intoOf, outList } from './callables.ts'
import type { Called, CallOptions, Room } from './room.ts'

/** One call that is open in a room that crosses: what it belongs to, and what the engine handed the room in it. */
export interface OpenCall {
  cx: CallContext | undefined
  // The functions the engine handed the room's code in this call, by their numbers.
  fns: Map<number, (...args: unknown[]) => unknown>
  // The `db`s the engine handed in this call: the three members that carry out what each makes.
  dbs: Map<number, DbMembers>
  // Carries work out in every context the engine was in where the call was opened: the request it answers among them.
  inside: <Answer>(work: () => Answer) => Answer
  // What still reads from the room after the call answered, as the body of a response, and whether it has answered.
  holds: number
  answered: boolean
  // A call that lives as long as the room: of a maker, or one that answered a function of what a maker made.
  kept: boolean
}

/** The open calls of one room: their numbers are the room's own, and known only while a call is open. */
export interface OpenCalls {
  open(cx: CallContext | undefined): number
  find(call: number): OpenCall
  // Closes a call once nothing reads from the room for it any more, and tells each that listens.
  close(call: number): void
  // Keeps a call open while something reads from the room for it: answers what lets it go.
  hold(call: number): () => void
  ended(listener: (call: number) => void): void
  // A number for what is handed in a call: of a function, a promise, a stream or a `db`.
  next(): number
  // Carries out a way that the code of the call the engine waits on at once asked, and whether one is under way.
  atOnce<Answer>(work: () => Answer): Answer
  isAtOnce(): boolean
}

// The open calls of each room that crosses, by the room.
const registries = new WeakMap<Room, OpenCalls>()

/** The open calls of a room, made with its first call. */
export function callsOf(room: Room): OpenCalls {
  const held = registries.get(room)
  if (held) return held
  const open = new Map<number, OpenCall>()
  const listeners: ((call: number) => void)[] = []
  let calls = 0
  let handed = 0
  let atOnce = 0
  const gone = (call: number): void => {
    open.delete(call)
    for (const listener of listeners) listener(call)
  }
  const made: OpenCalls = {
    open(cx) {
      const n = ++calls
      open.set(n, {
        cx,
        fns: new Map(),
        dbs: new Map(),
        inside: AsyncLocalStorage.snapshot(),
        holds: 0,
        answered: false,
        kept: false,
      })
      return n
    },
    find(call) {
      const one = open.get(call)
      if (!one)
        throw new TentError(
          'T0013',
          'The room asked for a call that is not open: a callable works while its call lasts.',
          {
            fix: 'Use what a call was handed inside that call, and keep none of it for a later one.',
          },
        )
      return one
    },
    close(call) {
      const one = open.get(call)
      if (!one) return
      one.answered = true
      if (one.holds === 0) gone(call)
    },
    hold(call) {
      const one = open.get(call)
      if (!one) return () => undefined
      one.holds += 1
      let free = false
      return () => {
        if (free) return
        free = true
        one.holds -= 1
        if (one.answered && one.holds === 0) gone(call)
      }
    },
    ended: (listener) => void listeners.push(listener),
    next: () => ++handed,
    atOnce(work) {
      atOnce += 1
      try {
        return work()
      } finally {
        atOnce -= 1
      }
    },
    isAtOnce: () => atOnce > 0,
  }
  registries.set(room, made)
  return made
}

/** How deep and how large a value of a call may cross: 64 deep, and `valueSize` of its app. */
export function boundsOf(cx: CallContext | undefined): Bounds {
  return { depth: 64, size: cx ? limitOf(cx.app.description, 'valueSize') : 1_000_000 }
}

/**
 * Takes a room and one of its open calls. Answers what keeps what the engine hands the room's code in that call:
 * each function, promise and stream under a number of its own, and each `db` by the members that carry it out.
 */
export function keeperOf(room: Room, call: number): Keeper {
  const calls = callsOf(room)
  const fn = (one: (...args: unknown[]) => unknown): number => {
    const n = calls.next()
    calls.find(call).fns.set(n, one)
    return n
  }
  return {
    fn,
    // A promise is asked for by its number below zero: the room is answered once it is settled.
    promise(promise) {
      // Its failure is told to the room when it asks for it, and so is not one that nothing waits for.
      Promise.resolve(promise).catch(() => undefined)
      return -fn(() => promise)
    },
    stream(stream) {
      const reader = stream.getReader()
      return fn(() => reader.read().then((read) => (read.done ? undefined : read.value)))
    },
    // A row that a `db` handed out crosses with what it was kept as, so its copy is kept as that again.
    tag: (value) => keptAs(value),
    db(value) {
      const face = faceOf(value)
      if (!face) return undefined
      const n = calls.next()
      const open = calls.find(call)
      open.dbs.set(n, face.members)
      const refused = !face.options.full && open.cx ? { refused: open.cx.work.name } : {}
      return { n, tables: face.options.tables, mode: face.options.mode, full: face.options.full, ...refused }
    },
  }
}

/**
 * Takes a room and one of its open calls. Answers how the engine asks for what the room's code handed it in that
 * call: a function by `back`, at once, and a promise by `back` with its number below zero, once it is settled.
 */
export function askerOf(room: Room, call: number): Asker {
  const options = (sync: boolean): CallOptions => ({ call, sync, pure: false, left: Number.POSITIVE_INFINITY })
  const asker: Asker = {
    // A function of the room's code is called as part of the call the engine is in now: a step that carries it
    // out among them, which what the function asks for is carried out in.
    fn: (n, args) => {
      const cx = underWay()
      // What a made thing answers lives as long as it does, where it is a function, as a driver its maker made.
      const kept = callsOf(room).find(call).kept
      return callCrossed(cx, room, { sync: true, pure: false, ...(kept ? { kept: 'holding' as const } : {}) }, (o) =>
        intoOf(room.back(call, n, outList(args, keeperOf(room, o.call), boundsOf(cx)), o), askerOf(room, o.call)),
      )
    },
    promise: async (n) => intoOf(await room.back(call, n, [], options(false)), asker),
    pull: async (n) => {
      const piece = await asker.promise(n)
      return piece instanceof Uint8Array ? piece : undefined
    },
    tagged: (value, tag) => handAgain(value, tag),
    theirs: (n) => callsOf(room).find(call).fns.get(n)?.(),
    held: () => callsOf(room).hold(call),
    db: () => {
      throw new TentError('T0013', 'The code of the room handed the engine a `db`, which it hands no one.')
    },
  }
  return asker
}

/**
 * Takes the call that is under way, where one is, whether the code answers at once, and whether it is pure.
 * Answers how the call is carried through its room: the number it was opened under in a room that crosses, 0 in
 * the room of the program, and the milliseconds it still has.
 */
function optionsOf(cx: CallContext | undefined, sync: boolean, pure: boolean): CallOptions {
  return {
    call: cx?.call ?? 0,
    sync,
    pure,
    left: cx === undefined ? Number.POSITIVE_INFINITY : Math.max(0, cx.work.ends - performance.now()),
  }
}

/** Whether a value that a call answered is a function, or a record that holds one: what is called later. */
const holdsFunction = (value: unknown): boolean =>
  typeof value === 'function' ||
  (typeof value === 'object' && value !== null && Object.values(value).some((one) => typeof one === 'function'))

/**
 * Closes a call once what it answered has settled: at once, or once a promise of it is kept or refused. With
 * `holding`, a call that answered a function is kept for the life of the room, and closed otherwise.
 */
function closedAfter<Answer>(
  calls: OpenCalls,
  call: number,
  answer: Answer,
  holding: boolean,
): Answer | Promise<Awaited<Answer>> {
  const settled = (value: unknown): void => {
    if (holding && holdsFunction(value)) calls.find(call).kept = true
    else calls.close(call)
  }
  if (typeof Reflect.get(Object(answer), 'then') !== 'function') {
    settled(answer)
    return answer
  }
  return Promise.resolve(answer).then(
    (value) => {
      settled(value)
      return value
    },
    (error: unknown) => {
      calls.close(call)
      throw error
    },
  )
}

/**
 * Takes the call that is under way, the room, and work that is handed the options of the call. In a room that
 * crosses, opens a number for the call that the room's code finds it again by, carries the work out under it, and
 * closes it once what the work answered has settled. In the room of the program it carries the work out as it is.
 */
export function callCrossed<Answer>(
  cx: CallContext | undefined,
  room: Room,
  o: { sync: boolean; pure: boolean; left?: number; kept?: true | 'holding' },
  work: (options: CallOptions) => Answer,
): Answer | Promise<Awaited<Answer>> {
  const options = optionsOf(cx, o.sync, o.pure)
  if (o.left !== undefined) options.left = o.left
  if (!room.crosses) return work(options)
  const calls = callsOf(room)
  const call = calls.open(cx && { ...cx, call: 0 })
  const open = calls.find(call)
  // Inside the call its context knows its number, by which the room's code finds it again.
  if (open.cx) open.cx.call = call
  // What a maker made lives as long as the room: its call is never closed.
  if (o.kept === true) {
    open.kept = true
    return work({ ...options, call })
  }
  try {
    return closedAfter(calls, call, work({ ...options, call }), o.kept === 'holding')
  } catch (error) {
    calls.close(call)
    throw error
  }
}

/**
 * Takes the call that is under way, an entry the room answered, what it is handed, and whether it answers at once
 * and is pure. Calls it through the room: in the program with one record of options, and in a room that crosses
 * under a number of its own.
 */
export function callIn(
  cx: CallContext | undefined,
  room: Room,
  called: Called,
  handed: unknown[],
  sync: boolean,
  pure: boolean,
): unknown {
  if (!room.crosses) return called(handed, optionsOf(cx, sync, pure))
  return callCrossed(cx, room, { sync, pure }, (options) => called(handed, options))
}
