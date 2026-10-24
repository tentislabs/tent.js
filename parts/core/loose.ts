import { isObject } from './own.ts'

/** Turns an object into the plain value JavaScript compares it by, where the sign gives no hint. */
function primitiveOf(value: object): unknown {
  const own: unknown = Reflect.get(value, Symbol.toPrimitive)
  if (own !== undefined && own !== null) {
    const made: unknown = typeof own === 'function' ? Reflect.apply(own, value, ['default']) : value
    if (!isObject(made)) return made
    throw new TypeError('Cannot convert object to primitive value')
  }
  for (const name of ['valueOf', 'toString']) {
    const method: unknown = Reflect.get(value, name)
    if (typeof method !== 'function') continue
    const made: unknown = Reflect.apply(method, value, [])
    if (!isObject(made)) return made
  }
  throw new TypeError('Cannot convert object to primitive value')
}

/**
 * Takes two values. Answers whether `==` of JavaScript holds them equal, with every step it takes: nothing equals
 * nothing, a text is read as a number beside a number, true and false count as 1 and 0, and an object is compared
 * by its plain value.
 */
export function looseEquals(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined) return b === null || b === undefined
  if (b === null || b === undefined) return false
  if (typeof a === typeof b) return a === b
  if (isObject(a)) return isObject(b) ? a === b : looseEquals(primitiveOf(a), b)
  if (isObject(b)) return looseEquals(a, primitiveOf(b))
  if (typeof a === 'boolean') return looseEquals(Number(a), b)
  if (typeof b === 'boolean') return looseEquals(a, Number(b))
  if (typeof a === 'symbol' || typeof b === 'symbol') return false
  if (typeof a === 'bigint' || typeof b === 'bigint')
    return String(Number(a)) === String(Number(b)) && Number(a) === Number(b)
  return Number(a) === Number(b)
}
