import { AsyncLocalStorage } from 'node:async_hooks'
import { isMainThread } from 'node:worker_threads'
import type { Caller } from '../../core/index.ts'
import type { Opened } from '../opened.ts'
import { gather } from './gather.ts'
import { cpuGiven } from './program.ts'

/**
 * A piece of work that came from outside, which the processor time of what it does is booked to: a call through the
 * door, a step of a run, a screen, the making anew of a live query, the engine's own work. `weak` is a piece that a
 * more particular one takes the place of: a request of the door that reaches a definition. `measured` is work
 * whose time is read whole around it, so that what it does inside books nothing more.
 */
interface Piece {
  app: Opened
  name: string
  caller?: Caller
  weak?: true
  measured?: true
}

const pieces = new AsyncLocalStorage<Piece>()

/** The processor time of this thread so far, for the code and for the system on its behalf, in milliseconds. */
export function threadMs(): number {
  const used = process.threadCpuUsage()
  return (used.user + used.system) / 1000
}

// The processor time of this thread at the last touch point.
let last = threadMs()

/**
 * A touch point of the main thread: where a piece of work enters, where its code calls the engine, where the engine
 * answers it, and where it returns. Books the processor time since the last touch point to the piece that is at
 * work now, as its context names it, as `mainCpuMs`. Time where no piece is at work belongs to no app.
 */
export function touch(): void {
  // A thread that carries out one piece of work at a time reads its own clock around it.
  if (!isMainThread) return
  const now = threadMs()
  const spent = now - last
  last = now
  const piece = pieces.getStore()
  if (!piece || piece.measured || spent <= 0) return
  cpuGiven(spent)
  gather(piece.app, piece.name, { mainCpuMs: spent }, piece.caller ? { caller: piece.caller } : {})
}

/**
 * Makes the piece of the door that is at work the piece of a definition from here on, once the request was found
 * to reach one, such as a screen: what it does from then on, the queries of its data among it, is booked to it.
 */
export function claimPiece(name: string, caller: Caller): void {
  const piece = pieces.getStore()
  if (!piece?.weak) return
  touch()
  piece.name = name
  piece.caller = caller
  delete piece.weak
}

/**
 * Takes an app, the name of a piece of work, its caller, and the work. Carries the work out as that piece, with a
 * touch point where it enters and where it returns, so that its processor time is booked to it. Inside another
 * piece it is part of that one, and nothing changes: but a piece that is `weak` gives way.
 */
export function asPiece<Answer>(
  o: Opened,
  name: string,
  caller: Caller | undefined,
  work: () => Answer,
  how: { weak?: true } = {},
): Answer {
  const held = pieces.getStore()
  // A call from code inside a piece is a call of the engine: a touch point of that piece.
  if (held && !held.weak) {
    touch()
    return work()
  }
  touch()
  return pieces.run({ app: o, name, ...(caller ? { caller } : {}), ...how }, () => {
    let answer: Answer
    try {
      answer = work()
    } catch (error) {
      touch()
      throw error
    }
    // A promise is answered as it is, with the touch point at its end beside it.
    if (answer instanceof Promise) void answer.then(touch, touch)
    else touch()
    return answer
  })
}

/**
 * Carries out work whose processor time is read whole around it, as the work of one step on a thread does, and
 * books it as `cpuMs` to the piece it is. What it does inside books no `mainCpuMs` beside it.
 */
export async function measured<Answer>(
  o: Opened,
  name: string,
  caller: Caller | undefined,
  work: () => Promise<Answer>,
): Promise<Answer> {
  touch()
  const began = threadMs()
  const wall = performance.now()
  try {
    return await pieces.run({ app: o, name, ...(caller ? { caller } : {}), measured: true }, work)
  } finally {
    const took = performance.now() - wall
    // A clock of the system that moves in steps of more than a millisecond cannot tell work shorter than one
    // step: such work is counted by the time it took, which its processor time is no more than.
    const step = clockStep()
    const spent = step > 1 && took < step ? took : threadMs() - began
    last = threadMs()
    cpuGiven(spent)
    gather(o, name, { cpuMs: spent }, caller ? { caller } : {})
  }
}

// The smallest step the processor clock of a thread moves by on this system, once it was measured.
let stepped: number | undefined

/** The smallest step the processor clock of this thread moves by: a few microseconds on most systems. */
function clockStep(): number {
  if (stepped !== undefined) return stepped
  const from = threadMs()
  const until = performance.now() + 40
  let now = from
  while (now === from && performance.now() < until) now = threadMs()
  stepped = Math.max(0, now - from)
  return stepped
}
