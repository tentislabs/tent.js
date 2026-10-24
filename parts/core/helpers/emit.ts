import { checkValue } from '../checkValue.ts'
import { TentError } from '../errors.ts'
import type { Events } from '../lists.ts'
import { isMarked } from '../mark.ts'
import { runtime } from '../runtime.ts'
import type { Type } from '../type.ts'
import type { Declared } from './triggers.ts'

const isType = (value: unknown): value is Type =>
  typeof value === 'object' && value !== null && typeof Reflect.get(value, 'kind') === 'string'

/**
 * Takes an event, by its declaration or by its name, and its data. Sends the event through the runtime, as part of
 * the write of the change it is called in. The data of a declared event is held to its type first. Throws T0002
 * for data that does not fit, and T0010 where the slot is empty.
 */
export function emit<const Name extends string, Data>(event: Declared<Name, Data>, data: NoInfer<Data>): void
export function emit<const Name extends Extract<keyof Events, string>>(event: Name, data: Events[Name]): void
// A name that the type list declares is held by the overload above, and by no other.
export function emit<const Name extends string>(event: Name extends keyof Events ? never : Name, data?: unknown): void
export function emit(event: unknown, data?: unknown): void {
  if (isMarked(event) && typeof event.event === 'string') {
    const type = event.data
    const [misfit] = isType(type) ? checkValue(type, data) : []
    if (misfit)
      throw new TentError('T0002', `The data of the event ${event.event}: ${misfit.message}`, {
        ...(misfit.fields ? { fields: misfit.fields } : {}),
        fix: 'Emit the event with data of the shape that its declaration gives.',
      })
    runtime('emit').emit(event.event, data)
    return
  }
  runtime('emit').emit(String(event), data)
}
