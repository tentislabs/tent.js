import type { Marker } from './definition.ts'
import { own } from './own.ts'
import { runtime } from './runtime.ts'

/** The member of a working object, where the engine gave the handle one of that name: a member of its own. */
function memberOf(working: object, handle: string, member: string): (...args: unknown[]) => unknown {
  const found = own(working, member)
  if (typeof found !== 'function') throw new TypeError(`${handle}.${member} is not a function`)
  return (...args) => Reflect.apply(found, working, args)
}

/**
 * Takes the name of a handle and of one of its members. Answers the member as a marker: reading it does no work,
 * it carries the name `<handle>.<member>`, and a call is forwarded to the working object that the runtime gives for
 * the handle. A call throws T0010 where the slot is empty.
 */
export function member<Fn>(handle: string, name: string): Fn & Marker
export function member(handle: string, name: string): unknown {
  const forward = (...args: unknown[]) => memberOf(runtime(`${handle}.${name}`).handle(handle), handle, name)(...args)
  return Object.assign(forward, { definition: `${handle}.${name}` })
}
