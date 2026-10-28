import { Worker } from 'node:worker_threads'
import { MessageChannel } from 'node:worker_threads'
import { TentError } from '../../../core/index.ts'
import { intoOf, outOf } from '../callables.ts'
import { askerOf, boundsOf, callsOf, keeperOf } from '../calls.ts'
import { placeOfVersion } from '../inProgram/loader.ts'
import { startedProgram } from '../inProgram/program.ts'
import { noteOutside, noteWord } from '../../touched.ts'
import type { Called, Entry, Room, RoomInput } from '../room.ts'
import type { Wire } from './wire.ts'
import { otherEnded, timedOut, wireOf } from './wire.ts'

// The program of the thread, which loads the room runtime into a heap of its own.
const threadFile = new URL('./thread.ts', import.meta.url)

// The memory of the thread, in MB: a call past it is T0037, and the thread is made anew.
const memory = 512

/** A version as the thread is told it: the modules it loads, its page code, and where its files lie. */
interface Told {
  id: string
  modules: { path: string; kinds: Entry['kind'][] }[]
  page?: string
  place: string
}

/** One thread of the room, while it lives, with what it was told of the entries. */
interface Thread {
  worker: Worker
  wire: Wire
  // The number of each entry on this thread, by the entry the engine asked for.
  entries: Map<string, number>
  // Whether every version it was told to load is loaded.
  ready: boolean
  ended?: Error
  // The moments past which the calls it answers later have ended, for each such answer still to come.
  later: Map<object, number>
}

const roomEnded = (why: string): TentError =>
  new TentError('T0037', `The room of the app ended the call: ${why}.`, {
    fix: 'Hold less in memory in one call, or end the work that does not end.',
  })

const tookTooLong = (): TentError =>
  new TentError('T0008', 'The code worked past the time of its call, and its room ended it.', {
    fix: 'Do less in one call, or raise the limit in `project.limits`.',
  })

/**
 * The framework's test room: the app's code runs in a thread of its own, which shares nothing with the engine. Every
 * value crosses by copy, every function as a callable, and a call that answers at once crosses at once. A call past
 * the time it still has ends the thread, and so does code past the memory of the thread, T0037: a thread is made
 * anew at once, with every version loaded again, ready for the next call.
 */
export function apartRoom(o: RoomInput): Room {
  const versions = new Map<string, Told>()
  let thread: Thread | undefined
  let room: Room | undefined
  let closed = false
  const roomOf = (): Room => {
    if (!room) throw new TentError('T0009', 'The test room was used before it was made.')
    return room
  }
  // The calls the engine waits on at once, the innermost last: the thread asks its ways inside them.
  const waiting: number[] = []
  /** What the thread asks the engine: the ways of the room. */
  const served = (what: string, body: unknown): unknown => {
    const b: Record<string, unknown> = Object(body)
    const call = Number(b.call)
    const args = Array.isArray(b.args) ? b.args : []
    const way = (): unknown => {
      if (what === 'runtime') return o.ways.runtime(call, wordOf(b.word), args)
      if (what === 'db') return o.ways.db(call, Number(b.db), memberOf(b.member), args)
      if (what === 'back') return o.ways.back(call, Number(b.fn), args)
      if (what === 'fetch') return o.ways.fetch(call, b.request)
      // What the code of a call read and reached, which a test of `tent test` stands on.
      if (what === 'word') return noteWord(String(b.word), typeof b.value === 'string' ? b.value : null)
      if (what === 'outside') return noteOutside(String(b.what))
      throw new TentError('T0009', `The thread of the test room asked for what the engine does not give: ${what}.`)
    }
    // Asked by the code of the call the engine waits on now, the way is carried out where the engine is now.
    const now = waiting.at(-1)
    return now !== undefined && now === Number(b.as) ? callsOf(roomOf()).atOnce(way) : way()
  }
  /** Starts a thread, which begins to load every version the room holds. */
  const spawned = (): Thread => {
    const { port1, port2 } = new MessageChannel()
    const flags = new Int32Array(new SharedArrayBuffer(16))
    const worker = new Worker(threadFile, {
      workerData: { port: port2, flags },
      transferList: [port2],
      resourceLimits: { maxOldGenerationSizeMb: memory },
    })
    worker.unref()
    const made: Thread = {
      worker,
      wire: wireOf(port1, flags, 0, served),
      entries: new Map(),
      ready: false,
      later: new Map(),
    }
    const ended = (error: Error): void => {
      if (made.ended) return
      made.ended = error
      made.wire.fail(error)
      if (thread !== made) return
      thread = undefined
      // A thread that ended by itself, as past its memory, is made anew for the next call.
      if (!closed) thread = spawned()
    }
    worker.on('error', (error: unknown) => {
      const code: unknown = Reflect.get(Object(error), 'code')
      ended(code === 'ERR_WORKER_OUT_OF_MEMORY' ? roomEnded(`it passed ${memory} MB`) : roomEnded(String(error)))
    })
    worker.on('exit', () => ended(roomEnded('its thread ended')))
    // Only `ready` waits for these: a thread that ends first refuses them, which is no failure.
    for (const told of versions.values()) quietly(made.wire.ask('load', { version: told }, { sync: false }))
    return made
  }
  /**
   * The thread that lives, every version loaded in it: made anew where none does. `within` bounds the wait for its
   * loading, where a call is under way: a module that never ends its top is then that call's time out.
   */
  const living = (within?: number): Thread => {
    // A thread that still holds an answer of a call whose time is up is ended first: its code holds the thread.
    const now = performance.now()
    if (thread && [...thread.later.values()].some((ends) => ends <= now)) ended(tookTooLong())
    if (!thread || thread.ended) thread = spawned()
    if (!thread.ready) {
      thread.wire.ask('ready', {}, { sync: true, ...(within === undefined ? {} : { within }) })
      thread.ready = true
    }
    return thread
  }
  /** Ends the thread of the room, and makes the next one at once. */
  const ended = (why: Error): void => {
    const one = thread
    if (!one) return
    one.ended = why
    one.wire.fail(why)
    thread = closed ? undefined : spawned()
    quietly(one.worker.terminate())
  }
  /** Asks the thread for a call, at once, and ends it where it does not answer within the time of the call. */
  const asked = (what: string, body: unknown, call: number, within: number): unknown => {
    waiting.push(call)
    try {
      const one = living(within)
      return one.wire.ask(what, body, { sync: true, within })
    } catch (error) {
      // A thread that ended while the engine waited for it at once is made anew, as one that passed its memory.
      if (error === otherEnded) {
        ended(roomEnded('its thread ended'))
        throw roomEnded('its thread ended')
      }
      if (error !== timedOut) throw error
      ended(tookTooLong())
      throw tookTooLong()
    } finally {
      waiting.pop()
    }
  }
  /** The number of an entry on the thread that lives. */
  const farOf = (version: string, entry: Entry): number => {
    const one = living()
    const key = `${version}\u0000${entry.module}\u0000${entry.path.join('\u0000')}`
    const held = one.entries.get(key)
    if (held !== undefined) return held
    const n = Number(one.wire.ask('entry', { version, entry }, { sync: true }))
    one.entries.set(key, n)
    return n
  }
  room = {
    crosses: true,
    async load(version) {
      const told: Told = {
        id: version.id,
        modules: version.modules,
        ...(version.page === undefined ? {} : { page: version.page }),
        place: placeOfVersion(version),
      }
      const before = versions.get(version.id)
      versions.set(version.id, {
        ...told,
        modules: [...(before?.modules ?? []), ...version.modules],
        ...(told.page === undefined && before?.page !== undefined ? { page: before.page } : {}),
      })
      await living().wire.ask('load', { version: told }, { sync: false })
    },
    entry(version, entry) {
      farOf(version, entry)
      const called: Called = (handed, c) => {
        const cx = callsOf(roomOf()).find(c.call).cx
        const bounds = boundsOf(cx)
        const sent = outOf(handed, keeperOf(roomOf(), c.call), bounds)
        const answer = asked(
          'call',
          { entry: farOf(version, entry), call: c.call, handed: sent, pure: c.pure, bounds },
          c.call,
          c.left,
        )
        return intoOf(answer, askerOf(roomOf(), c.call))
      }
      return called
    },
    draw(version) {
      return async ({ signal: _, ...input }, c) => {
        const cx = callsOf(roomOf()).find(c.call).cx
        const bounds = boundsOf(cx)
        const sent = outOf(input, keeperOf(roomOf(), c.call), bounds)
        const answer = asked('draw', { version, call: c.call, input: sent, left: c.left, bounds }, c.call, c.left)
        return Object(await intoOf(answer, askerOf(roomOf(), c.call)))
      }
    },
    back(call, fn, args, c) {
      const cx = callsOf(roomOf()).find(c.call || call).cx
      const body = { call, fn, args, as: c.call, bounds: boundsOf(cx) }
      if (c.sync) return asked('back', body, c.call, c.left)
      const one = living()
      const later = one.wire.ask('back', body, { sync: false })
      // Code that answers later and then holds its thread past the time of its call is ended with the thread.
      const left = cx === undefined ? Number.POSITIVE_INFINITY : cx.work.ends - performance.now()
      // A timer holds a wait of 2^31 - 1 milliseconds at most, and fires at once past it.
      if (!(later instanceof Promise) || !(left <= 2_147_483_647)) return later
      const ends = performance.now() + left
      const mark = {}
      one.later.set(mark, ends)
      const timer = setTimeout(() => {
        if (thread === one && !one.ended) ended(tookTooLong())
      }, left)
      timer.unref()
      return later.finally(() => {
        clearTimeout(timer)
        one.later.delete(mark)
      })
    },
    program: (start) => startedProgram(start),
    unload(version) {
      versions.delete(version)
      if (thread) quietly(thread.wire.ask('unload', { version }, { sync: false }))
    },
    async close() {
      closed = true
      versions.clear()
      const one = thread
      thread = undefined
      if (one) await one.worker.terminate()
    },
  }
  // What the code of a call handed the engine is let go in the thread once the call has ended.
  callsOf(room).ended((call) => {
    if (thread && !thread.ended) quietly(thread.wire.ask('forget', { call }, { sync: false }))
  })
  return room
}

/** Leaves an ask that nothing waits for: its failure, as of a thread that ended, is not one that ends the program. */
function quietly(asked: unknown): void {
  Promise.resolve(asked).catch(() => undefined)
}

/** A word of the runtime slot that the thread names. */
function wordOf(word: unknown): 'call' | 'handle' | 'start' | 'emit' | 'draw' {
  if (word === 'call' || word === 'handle' || word === 'start' || word === 'emit' || word === 'draw') return word
  throw new TentError('T0013', 'The thread of the test room asked for a word the runtime does not give.')
}

/** A member of `db` that the thread names. */
function memberOf(member: unknown): 'read' | 'write' | 'sql' {
  if (member === 'read' || member === 'write' || member === 'sql') return member
  throw new TentError('T0013', 'The thread of the test room asked for a member of `db` that it does not have.')
}
