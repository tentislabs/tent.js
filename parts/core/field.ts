import { own } from './own.ts'

/**
 * Takes a value and the names of a path into it. Answers what stands there, read one name after another, and
 * nothing where a name meets what is no record on its way, or a member that the value has from the runtime alone.
 */
export function fieldOf(value: unknown, names: readonly string[]): unknown {
  let at = value
  for (const name of names) {
    if (typeof at !== 'object' || at === null) return undefined
    at = own(at, name)
  }
  return at
}
