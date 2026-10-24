import type { At } from '../../flows/index.ts'
import type { CallContext } from '../context.ts'
import type { Opened } from '../opened.ts'
import type { Fed, KeptRead } from './kept.ts'

/** What the work of a step that remembers read while it worked: each read, the rows they answered, and what notes them. */
export interface StepReads {
  reads: KeptRead[]
  fed: Fed[]
  noting: NonNullable<CallContext['noting']>
}

// The steps whose remembered answer was looked for and not given, until their work begins, by app and by step.
const due = new WeakMap<Opened, Map<string, StepReads>>()
// The work of a step that began, by where it stands: its answer is kept with what it read.
const working = new WeakMap<At, StepReads>()
// A step that never began its work here, as one handed to a worker, leaves its entry: the oldest go past this many.
const dueKept = 1000

const stepOf = (at: At): string => `${at.run}\n${at.step?.name ?? ''}\n${at.step?.repeat ?? 0}`

/** Notes that the work of a step is to be carried out, and that what it reads is to be kept with its answer. */
export function readsDue(o: Opened, at: At, reads: StepReads): void {
  const under = due.get(o) ?? new Map<string, StepReads>()
  due.set(o, under)
  under.delete(stepOf(at))
  under.set(stepOf(at), reads)
  for (const key of under.keys()) {
    if (under.size <= dueKept) break
    under.delete(key)
  }
}

/** The noting of the work of a step whose reads are due, as that work begins: nothing for any other work. */
export function stepNoting(o: Opened, at: At): StepReads['noting'] | undefined {
  const under = due.get(o)
  const reads = at.step ? under?.get(stepOf(at)) : undefined
  if (!reads) return undefined
  under?.delete(stepOf(at))
  working.set(at, reads)
  return reads.noting
}

/** What the work of a step read, where it was noted: by the same place its work was carried out at. */
export const readsOfStep = (at: At): StepReads | undefined => working.get(at)
