import type { Clock } from '../../core/internal.ts'
import type { Opened } from '../opened.ts'
import type { OutTask } from './state.ts'

/**
 * The tasks that are out to one worker. Each second that the worker holds tasks is shared evenly among them: every
 * change of what it holds first books the time since the last change, a share to each task in `heldMs`, and time
 * with none is handed to `free`. A task that leaves keeps its share, for the write that settles its try.
 */
export class TasksOut extends Map<string, OutTask> {
  private last: number
  private readonly clock: Clock
  private readonly gone: (out: OutTask) => void
  // Time in which the worker held nothing, in ms: it is idle, or not yet ready.
  free: (ms: number) => void = () => undefined

  constructor(clock: Clock, gone: (out: OutTask) => void) {
    super()
    this.clock = clock
    this.gone = gone
    this.last = clock.now()
  }

  /** Books the time since the last change: shared among the tasks held, or free where there are none. */
  advance(): void {
    const now = this.clock.now()
    const span = Math.max(0, now - this.last)
    this.last = now
    if (!span) return
    if (!this.size) {
      this.free(span)
      return
    }
    for (const out of this.values()) out.heldMs = (out.heldMs ?? 0) + span / this.size
  }

  override set(task: string, out: OutTask): this {
    this.advance()
    return super.set(task, out)
  }

  override delete(task: string): boolean {
    this.advance()
    const out = super.get(task)
    if (out) this.gone(out)
    return super.delete(task)
  }
}

// The tasks of each app that left their worker and wait for the write that settles their try, by their id.
const left = new WeakMap<object, Map<string, OutTask & { leftAt: number }>>()

// How long a task that left is kept for that write: one that never comes is a hand-out that did not go.
const keptFor = 10 * 60_000

const leftOf = (o: Opened): Map<string, OutTask & { leftAt: number }> => {
  let made = left.get(o.handles)
  if (!made) {
    made = new Map()
    left.set(o.handles, made)
  }
  return made
}

/** Keeps a task that left its worker, with its share, until the write that settles its try books it. */
export function taskLeft(o: Opened, out: OutTask): void {
  const now = o.clock.now()
  const held = leftOf(o)
  for (const [task, one] of held) if (now - one.leftAt > keptFor) held.delete(task)
  held.set(out.task, { ...out, leftAt: now })
}

/** The task that left its worker by that id, as it was when it left; with `take`, it is kept no more. */
export function leftTask(o: Opened, task: string, take = false): OutTask | undefined {
  const held = leftOf(o)
  const out = held.get(task)
  if (take) held.delete(task)
  return out
}

/** Every task of an app that left its worker and was not booked yet: what it reserved stands until it is. */
export const tasksLeft = (o: Opened): OutTask[] => [...leftOf(o).values()]
