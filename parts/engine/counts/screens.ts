import type { Caller } from '../../core/index.ts'
import type { Opened } from '../opened.ts'
import { visit } from '../visit.ts'
import { claimPiece } from './cpu.ts'
import { gather } from './gather.ts'

/** Counts the drawing of a screen under its name, as a call is counted: once it was drawn, or failed. */
export function countScreen(o: Opened, name: string, caller: Caller, began: number, error?: unknown): void {
  if (Object.hasOwn(o.description.screens, name)) countAnswered(o, name, caller, began, error)
}

/** Counts a route or a call coming in under its name, as a call is counted: once it answered, or failed. */
export function countAnswered(o: Opened, name: string, caller: Caller, began: number, error?: unknown): void {
  gather(
    o,
    name,
    { calls: 1, ms: performance.now() - began, ...(error === undefined ? {} : { failed: 1 }) },
    { caller },
  )
}

/**
 * A request is found to reach a screen, a route or a call coming in: from here on it is that one's, its bytes and
 * its processor time, with that of the calls inside it, as the queries of the data of a screen.
 */
export function countAnswering(name: string, caller: Caller): void {
  claimPiece(name, caller)
  const visited = visit()
  if (visited) visited.counted = { name, caller }
}
