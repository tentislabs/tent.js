import { randomBytes } from 'node:crypto'
import { storedLimit } from '../limits.ts'
import type { Opened } from '../opened.ts'

/** What a person allowed, as a code carries it to the token address. */
export interface Allowed {
  user: string
  client: string
  name: string
  redirect: string
  challenge: string
  scopes: string[]
  resource: string
  for: 'mcp' | 'app'
}

/** A code as the engine keeps it: what was allowed, when, and the grant that its first use made. */
interface Kept extends Allowed {
  at: number
  grant?: string
}

// Codes live in the memory of the engine alone: one that a restart lost is asked for anew.
const held = new WeakMap<Opened, Map<string, Kept>>()

function codesOf(o: Opened): Map<string, Kept> {
  const made = held.get(o) ?? new Map<string, Kept>()
  held.set(o, made)
  const now = o.clock.now()
  const life = storedLimit(o.description, 'codeTime')
  // A code past its minute is kept as long again, so that its second use still ends the grant its first one made.
  for (const [code, one] of made) if (now - one.at > 2 * life) made.delete(code)
  return made
}

/** A new code for what a person allowed, which works once, within `codeTime`. */
export function newCode(o: Opened, allowed: Allowed): string {
  const code = randomBytes(32).toString('base64url')
  codesOf(o).set(code, { ...allowed, at: o.clock.now() })
  return code
}

/**
 * Takes a code that is handed in. Answers what it holds and whether it may still be used: not used before and
 * within its minute; and for a code that was used, the grant that its first use made, which a second use ends.
 */
export function codeAt(o: Opened, code: string): { allowed: Allowed; fresh: boolean; grant?: string } | undefined {
  const one = codesOf(o).get(code)
  if (!one) return undefined
  const { at, grant, ...allowed } = one
  const fresh = grant === undefined && o.clock.now() - at <= storedLimit(o.description, 'codeTime')
  return { allowed, fresh, ...(grant ? { grant } : {}) }
}

/** Marks a code used, with the grant that its use made, or with none where its use was refused. */
export function codeUsed(o: Opened, code: string, grant = ''): void {
  const one = codesOf(o).get(code)
  if (one) one.grant = grant
}
