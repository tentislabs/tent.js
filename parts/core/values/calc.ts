import { mark } from '../mark.ts'
import { calcSigns, signed } from '../signs.ts'
import { cannot, holdsReference } from '../word.ts'
import { asValue } from '../written.ts'

/**
 * Takes a sign and two values. Answers what JavaScript works out for the sign: `calc` is the sign it names and
 * nothing more. Handed a reference it answers its record. Throws T0027 for a sign that is none of its own.
 */
export function calc(op: '+' | '-' | '*' | '/' | '%', a: number, b: number): number
export function calc(op: '==' | '!=' | '<' | '<=' | '>' | '>=', a: unknown, b: unknown): boolean
export function calc(op: unknown, a: unknown, b: unknown): unknown {
  if (holdsReference([a, b])) return mark({ calc: op, left: asValue(a), right: asValue(b) })
  return typeof op === 'string' && calcSigns.includes(op)
    ? signed(op, a, b)
    : cannot('calc', op, `one of ${calcSigns.join(' ')}`)
}
