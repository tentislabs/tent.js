import { TentError } from '../../../core/index.ts'
import type { Runtime } from '../../../core/internal.ts'
import type { Bounds } from '../callables.ts'
import { intoLater, outList } from '../callables.ts'
import type { InsideWays } from './handed.ts'
import { askerIn, keeperIn } from './handed.ts'

/** How the room runtime knows the call that is under way across the code's own waits: the host's to give. */
export interface Carry {
  run<Answer>(call: number, work: () => Answer): Answer
  current(): number | undefined
}

/** Answers the call that is under way. Throws T0013 where none is, as the runtime slot does in the program. */
function callOf(carry: Carry, used: string): number {
  const call = carry.current()
  if (call === undefined)
    throw new TentError('T0013', `${used} was used with no call under way.`, {
      fix: 'A definition and a handle work inside a call: in the `run` of a function, and never in a maker of `engine.ts`.',
    })
  return call
}

/**
 * The working object of a handle in this heap: each member is read from the engine's by its path, at once, so a
 * member that is a value reads as that value, one that is a record reads on, and one that is a function calls the
 * engine's, as the caller of the call.
 */
function handleOf(ways: InsideWays, carry: Carry, bounds: Bounds, name: string, path: string[] = []): object {
  const ask = (call: number, args: unknown[]): unknown =>
    intoLater(ways.runtime(call, 'handle', outList(args, keeperIn(call), bounds)), askerIn(ways, call, bounds))
  const read = (key: string | symbol): { value: unknown } | undefined => {
    // A handle is no promise, and has no member of a symbol.
    if (typeof key !== 'string' || key === 'then') return undefined
    // Where no way answers at once, a member is read on by its path, and the engine answers it when it is called.
    if (ways.sync === false) return { value: handleOf(ways, carry, bounds, name, [...path, key]) }
    const call = callOf(carry, `The handle \`${name}\``)
    const told: unknown = ask(call, [name, [...path, key], 'get'])
    const member: unknown = Reflect.get(Object(told), 'member')
    if (member === 'value') return { value: Reflect.get(Object(told), 'value') }
    return { value: handleOf(ways, carry, bounds, name, [...path, key]) }
  }
  return new Proxy(() => undefined, {
    get: (_, key) => read(key)?.value,
    // A member of a handle is its own, as the engine's working object holds it.
    getOwnPropertyDescriptor(_, key) {
      const found = read(key)
      return found && { value: found.value, writable: false, enumerable: true, configurable: true }
    },
    has: (_, key) => read(key) !== undefined,
    apply(_, _this, args) {
      const call = callOf(carry, `The handle \`${name}\``)
      return ask(call, [name, path, 'call', args])
    },
  })
}

/**
 * Takes the ways of the room, how a call is carried, and the bounds of a value. Answers the runtime slot of `core`
 * in this heap: each word reaches the engine through `ways.runtime`, for the call that is under way, and what it
 * answers is taken into this heap.
 */
export function runtimeOver(ways: InsideWays, carry: Carry, bounds: Bounds): Runtime {
  const word = (call: number, which: 'call' | 'start' | 'emit' | 'draw', args: unknown[]): unknown =>
    intoLater(ways.runtime(call, which, outList(args, keeperIn(call), bounds)), askerIn(ways, call, bounds))
  const nameOf = (flow: unknown): string =>
    typeof flow === 'string' ? flow : String(Reflect.get(Object(flow), 'definition'))
  return {
    call: (definition, args) => word(callOf(carry, definition), 'call', [definition, args]),
    handle: (name) => handleOf(ways, carry, bounds, name),
    start: (flow, input) => word(callOf(carry, `start of ${nameOf(flow)}`), 'start', [nameOf(flow), input]),
    emit(event, data) {
      word(callOf(carry, `emit of ${event}`), 'emit', [event, data])
    },
    draw(which, args) {
      const call = carry.current()
      if (call === undefined) return undefined
      const told: unknown = word(call, 'draw', [which, args])
      return typeof told === 'object' && told !== null && 'value' in told ? { value: told.value } : undefined
    },
  }
}
