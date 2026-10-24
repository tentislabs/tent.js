import { randomBytes } from 'node:crypto'

/** A call of the older form whose server asked for an answer down its stream, where the call waits for it. */
export interface HeldCall {
  answered(response: Record<string, unknown>): Promise<Record<string, unknown>>
  drop(): void
}

// Kept in memory alone: after a restart, or once the call's own time is up, the call is made anew, and the answer
// goes to the same question where the server asks it again.
const held = new Map<string, { call: HeldCall; timer: NodeJS.Timeout }>()

// What the state of a held call starts with, so that it is never taken for a state that a server gave.
const mark = 'tent.held.'

/**
 * Holds a call for as long as it may live, and answers the state under which it is taken again, which carries the
 * print of the question it waits on.
 */
export function holdCall(call: HeldCall, life: number, print: string): string {
  const state = `${mark}${randomBytes(12).toString('base64url')}.${print}`
  const timer = setTimeout(() => {
    held.delete(state)
    call.drop()
  }, life)
  timer.unref()
  held.set(state, { call, timer })
  return state
}

/** Takes a held call by its state, once: nothing for a state that holds none, or no longer. */
export function takeCall(state: string): HeldCall | undefined {
  const found = held.get(state)
  if (!found) return undefined
  held.delete(state)
  clearTimeout(found.timer)
  return found.call
}

/** Whether a state is one of a held call rather than one a server gave. */
export const isHeldState = (state: string): boolean => state.startsWith(mark)

/** The print of the question that the call of a held state waited on. */
export const questionInState = (state: string): string => state.slice(state.lastIndexOf('.') + 1)
