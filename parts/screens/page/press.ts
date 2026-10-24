import type { WireError } from '../../core/index.ts'
import { addressOf, isOutside } from './address.ts'
import type { SetState } from './ownState.ts'
import type { Side, PageStore } from './store.ts'
import { isStored } from '../../core/internal.ts'

/** The name that a call goes to: of a definition as a screen file holds it. */
export const calledBy = (what: unknown): string | undefined =>
  (isStored(what) || typeof what === 'function') && typeof Reflect.get(what, 'definition') === 'string'
    ? String(Reflect.get(what, 'definition'))
    : undefined

/** What a caller sees of an error, whatever was thrown. */
export function seenOf(error: unknown): WireError {
  if (isStored(error) && typeof error.code === 'string' && typeof error.message === 'string') {
    const { code, name, message, fields, ref } = error
    return {
      code,
      name: typeof name === 'string' ? name : '',
      message,
      ...(isStored(fields)
        ? { fields: Object.fromEntries(Object.entries(fields).map(([field, check]) => [field, String(check)])) }
        : {}),
      ...(typeof ref === 'string' ? { ref } : {}),
    }
  }
  return { code: 'T0009', name: 'failed', message: 'Something went wrong. Try again.' }
}

const sides: readonly unknown[] = ['top', 'bottom', 'start', 'end']
const isSide = (value: unknown): value is Side => sides.includes(value)

/** How `above` of a `then` opens the screen it goes to: in the middle, along an edge, or as a move of the page. */
function overOf(above: unknown): { above: true; side?: Side } | undefined {
  if (above === true) return { above: true }
  return isStored(above) && isSide(above.side) ? { above: true, side: above.side } : undefined
}

/** Does what follows a call that worked: a change of state, a move, or leaving for an address that the call answered. */
export function follow(store: PageStore, then: unknown, answer: unknown, set: SetState): void {
  const next = typeof then === 'function' ? then(answer) : then
  if (!isStored(next)) return
  if (isStored(next.set)) set(next.set, { press: true })
  const address =
    next.goTo === undefined || next.goTo === null ? undefined : addressOf(next.goTo, next.with, store.stub)
  const above = overOf(next.above)
  if (address !== undefined) store.goTo(address, above)
  else if (typeof next.href === 'string' && isOutside(next.href)) store.goTo(next.href)
}
