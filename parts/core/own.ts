/** Whether a value can hold members: a record, a list or a function. */
export const isObject = (value: unknown): value is object =>
  (typeof value === 'object' && value !== null) || typeof value === 'function'

const prototypeOf = (value: object): object => Object.getPrototypeOf(value)

// What the runtime itself stands behind its own kinds of value. A member that a thing takes from one of these was
// given by the runtime and by nobody who made the thing.
const ofRuntime = new Set<object>([
  Object.prototype,
  Function.prototype,
  prototypeOf(async () => undefined),
  prototypeOf(function* () {}),
  prototypeOf(async function* () {}),
  Array.prototype,
  Promise.prototype,
  Map.prototype,
  Set.prototype,
  Date.prototype,
  RegExp.prototype,
  Error.prototype,
  String.prototype,
  Number.prototype,
  Boolean.prototype,
  Symbol.prototype,
  BigInt.prototype,
])

// Every class hands these two names to what it makes, and they lead from a thing to what made it.
const never = ['constructor', '__proto__']

/**
 * Takes a value, and a name. Answers `{ value }` with the member of that name where it is a member of the value's
 * own: one that the value holds itself, or that whoever made the value gave its kind. So a member whose value is
 * nothing is told from no member. Answers nothing for a name that the value only inherits from the runtime, as
 * `toString`, and `call`, `apply` and `bind` of a function; for `constructor` and `__proto__`, whoever gave them;
 * and for a name that the value does not have.
 */
export function ownMember(from: object, name: string): { value: unknown } | undefined {
  if (never.includes(name)) return undefined
  for (let at: object | null = from; at !== null && !ofRuntime.has(at); at = Object.getPrototypeOf(at))
    if (Object.hasOwn(at, name)) return { value: Reflect.get(at, name, from) }
  return undefined
}

/**
 * Takes a value, and a name. Answers whether the name is one that is never there for a stored form and for the
 * reader of a plain file: `constructor` and `__proto__`, and a name that the value has from the runtime alone.
 */
export const isInherited = (from: object, name: string): boolean =>
  never.includes(name) || (ownMember(from, name) === undefined && name in from)

/**
 * Takes a thing that the engine handed out - `db`, a table of it, `step`, the working object of a handle - and a
 * name. Answers the member of that name where it is a member of the thing's own, and nothing for a name that is
 * not, as for a name the thing does not have, and for a thing that holds no members.
 */
export function own(thing: unknown, name: string): unknown {
  return isObject(thing) ? ownMember(thing, name)?.value : undefined
}
