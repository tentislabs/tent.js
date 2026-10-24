import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import { isStored } from '../../core/internal.ts'
import type { Opened } from '../opened.ts'
import { callReadsOnly } from '../onlyReads.ts'

const outside = (what: string, scope: string): TentError =>
  new TentError('T3101', `${what.slice(0, 80)} is outside the scopes that the person granted this program.`, {
    fix: `Ask the person for the scope \`${scope}\` at the next sign-in.`,
  })

/** Whether a finer scope of `mcp.scopes` that a grant holds names a function. */
function finer(o: Opened, scopes: string[], name: string): boolean {
  const named: unknown = Reflect.get(Object(o.description.project.mcp), 'scopes')
  return scopes.some((scope) => {
    const listed = isStored(named) ? named[scope] : undefined
    return Array.isArray(listed) && listed.includes(name)
  })
}

/**
 * Part of step 6 of the door, for a caller that is the token of a program: `write` opens every function and route,
 * a finer scope the functions it names, and `read` what only reads, and every call that only reads, as a read of a
 * page does. They hold at the call that came through the door, and not for what that call calls from code. Throws
 * T3101.
 */
export function inGrant(o: Opened, caller: Caller, name: string, reads: boolean): void {
  if (caller.kind !== 'mcp' || !caller.grant) return
  const { scopes } = caller.grant
  if (scopes.includes('write') || finer(o, scopes, name)) return
  if (scopes.includes('read') && (reads || callReadsOnly(o.description, name))) return
  throw outside(name, 'write')
}

/** An upload of the token of a program, which needs the scope `write`. Throws T3101 for any other. */
export function grantUploads(caller: Caller): void {
  if (caller.kind === 'mcp' && caller.grant && !caller.grant.scopes.includes('write'))
    throw outside('An upload', 'write')
}
