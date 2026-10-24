import { looseEquals } from './loose.ts'
import { sizedWritten } from './word.ts'

// Each sign as JavaScript works it out for whatever it is handed: the types say numbers, and the values decide.
const signs: Record<string, (a: never, b: never) => unknown> = {
  '+': (a: number, b: number) => a + b,
  '-': (a: number, b: number) => a - b,
  '*': (a: number, b: number) => a * b,
  '/': (a: number, b: number) => a / b,
  '%': (a: number, b: number) => a % b,
  '<': (a: number, b: number) => a < b,
  '<=': (a: number, b: number) => a <= b,
  '>': (a: number, b: number) => a > b,
  '>=': (a: number, b: number) => a >= b,
  '==': (a: unknown, b: unknown) => looseEquals(a, b),
  '!=': (a: unknown, b: unknown) => !looseEquals(a, b),
  '===': (a: unknown, b: unknown) => a === b,
  '!==': (a: unknown, b: unknown) => a !== b,
}

/** The signs of `calc`, which a body and a view write too. */
export const calcSigns = ['+', '-', '*', '/', '%', '==', '!=', '<', '<=', '>', '>=']

/** Whether a sign is one that takes both of its sides worked out. */
export const isSign = (op: unknown): op is string => typeof op === 'string' && Object.hasOwn(signs, op)

/**
 * Takes a sign and its two sides. Answers what JavaScript works out for them. What `+` makes of a text is a text
 * of `valueSize` characters at the most, as a word makes one: T0027 beyond it. The runtime joins two texts without
 * laying them out, so the text that is held to the limit takes no room yet.
 */
export function signed(op: string, left: unknown, right: unknown): unknown {
  // Two numbers are added, whatever they come to. Anything else is written and joined, and is held before it is.
  if (op === '+' && !(typeof left === 'number' && typeof right === 'number')) sizedWritten('+', [left, right])
  return Reflect.apply(signs[op], undefined, [left, right])
}

const minus = (a: number) => -a

/** Takes a value. Answers it with the sign of a minus in front, as JavaScript works it out. */
export const negated = (value: unknown): unknown => Reflect.apply(minus, undefined, [value])
