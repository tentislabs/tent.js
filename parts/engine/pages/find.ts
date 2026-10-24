import type { Description } from '../../core/internal.ts'
import { deviceRead, heldToType, isStored, readAddress, stateEntries } from '../../core/internal.ts'

/** How exact one part of a pattern is: a fixed part before a value, and a value before the rest. */
const rank = (part: string): number => (part === '*' ? 2 : part.startsWith(':') ? 1 : 0)

/** The values of an address that fits a pattern, each with its percent signs read, or nothing where it does not fit. */
function fits(pattern: string, parts: string[]): Record<string, string> | undefined {
  const wanted = pattern.split('/').slice(1)
  const params: Record<string, string> = {}
  for (const [k, part] of wanted.entries()) {
    // The rest of an address is everything after its place, and stands last.
    if (part === '*') {
      params.rest = parts.slice(k).map(decodeURIComponent).join('/')
      return params
    }
    const given = parts[k]
    if (given === undefined) return undefined
    if (part.startsWith(':')) {
      if (given === '') return undefined
      params[part.slice(1)] = decodeURIComponent(given)
    } else if (part !== given) return undefined
  }
  return wanted.length === parts.length ? params : undefined
}

/** Takes a pattern and the path of an address. Answers the values of the address that fits it, or nothing. */
export const fitsPattern = (pattern: string, path: string): Record<string, string> | undefined =>
  fits(pattern, path.split('/').slice(1))

/**
 * Takes a description and the path of an address. Answers the screen that the address fits, with the values of
 * the address, or nothing where no screen fits. Of two screens that fit, the one whose pattern is more exact
 * wins, part by part from the left.
 */
export function screenAt(
  description: Description,
  path: string,
): { name: string; params: Record<string, string> } | undefined {
  const parts = path.split('/').slice(1)
  let best: { name: string; params: Record<string, string>; ranks: number[] } | undefined
  for (const [name, screen] of Object.entries(description.screens)) {
    const pattern = isStored(screen) ? screen.path : undefined
    if (typeof pattern !== 'string') continue
    const params = fits(pattern, parts)
    if (!params) continue
    const ranks = pattern.split('/').slice(1).map(rank)
    const closer = best === undefined || firstLess(ranks, best.ranks)
    if (closer) best = { name, params, ranks }
  }
  return best && { name: best.name, params: best.params }
}

/**
 * Whether one list of ranks is more exact than another at the first place where the two differ. A pattern that
 * ends where the other goes on fits the address exactly there, and the other only by a rest that takes nothing.
 */
function firstLess(one: number[], other: number[]): boolean {
  for (let k = 0; k < Math.max(one.length, other.length); k++)
    if ((one[k] ?? -1) !== (other[k] ?? -1)) return (one[k] ?? -1) < (other[k] ?? -1)
  return false
}

/**
 * Takes the stored state of a screen and what stands after the question mark of the address. Answers the value of
 * each state that is kept in the address and is written there: one that does not fit its type is left out, so that
 * the state is its default.
 */
export function stateOf(state: unknown, search: URLSearchParams): Record<string, unknown> {
  return readAddress(stateEntries(state), search)
}

/**
 * Takes the stored state of the project and of a screen, the name of the screen, and the value of the cookie
 * that keeps the device states of the app. Answers the value of each state that is kept in the device and that
 * the cookie holds, a state of the project under its name and a state of the screen under the name of the
 * screen, a dot and its own. A value that does not fit its type is left out, so that the state is its default.
 */
export function deviceStateOf(shared: unknown, own: unknown, screen: string, cookie: string): Record<string, unknown> {
  const held = deviceRead(cookie)
  const found: Record<string, unknown> = {}
  const take = (declared: unknown, front: string): void => {
    for (const [name, entry] of Object.entries(stateEntries(declared))) {
      const kept = held[`${front}${name}`]
      // What a cookie holds is what its sender wrote: it is held to the type as a worked-out value is, and a
      // number outside its limits is brought to them.
      const fits =
        entry.in !== 'device' || kept === undefined || kept === null ? undefined : heldToType(entry.type, kept)
      if (fits !== undefined) found[name] = fits
    }
  }
  take(shared, '')
  take(own, `${screen}.`)
  return found
}
