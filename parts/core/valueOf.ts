import { carrying, firstNames, value } from './evaluate.ts'

/**
 * Takes one stored value, and what it is worked out with: `names`, the names it reads; `ref`, which answers its
 * references; `tick`, which every word that makes or walks a list asks
 * once for each entry; and `zone`, the zone of a `dayOf` that names none. Answers the value. It reads a name from
 * `names` and from nowhere else, and reaches a definition and a handle through the runtime slot. Throws T0011 for
 * a form that it does not carry out, an `await` among them, and what the words and the calls inside it throw.
 */
export function valueOf(
  stored: unknown,
  o: {
    names?: Record<string, unknown>
    ref?(ref: object): unknown
    tick?(): void
    zone?: string
  } = {},
): unknown {
  const { names = {}, ...rest } = o
  return value(stored, firstNames(names), carrying(names, rest))
}
