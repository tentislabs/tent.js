import { mark } from '../mark.ts'
import { cannot, drawn, holdsReference, sized } from '../word.ts'
import { asValue, isWritten } from '../written.ts'

/**
 * Takes nothing, or `{ digits }`, a whole number from 1 up. Answers a new secret text, or that many digits, which
 * it asks the engine for. Where a definition is being made, or no call is under way, and handed a reference, it
 * answers its record. Throws T0027 for a `digits` that is no whole number from 1 up, and for more digits than a
 * value may hold.
 */
export function token(o?: { digits?: number }): string
export function token(...values: unknown[]): unknown {
  const made = () => mark({ fn: 'token', args: values.map(asValue) })
  if (holdsReference(values)) return made()
  const [o] = values
  const digits = isWritten(o) ? o.digits : undefined
  if (o !== undefined && !isWritten(o)) cannot('token', o, 'nothing, or { digits }')
  if (digits !== undefined && !(Number.isInteger(digits) && Number(digits) >= 1))
    cannot('token', digits, 'a whole number of digits from 1 up')
  if (digits !== undefined) sized('token', Number(digits))
  const drew = drawn('token', values)
  return drew ? drew.value : made()
}
