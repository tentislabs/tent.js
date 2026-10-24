import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'

/** What a caller is in the log: their kind, and the id of the user, the key or the grant where they are one. */
export function callerOf(caller: Caller): { callerKind: string; callerId: string | undefined } {
  const callerId = caller.kind === 'system' ? caller.starter : (caller.key?.id ?? caller.grant?.id ?? caller.user?.id)
  return { callerKind: caller.kind, callerId }
}

/** The roles a caller has: those of its key where it is one, and of its user otherwise. */
const rolesOf = (caller: Caller): string[] => caller.key?.roles ?? caller.user?.roles ?? []

/** Whether a caller is signed in: a user, a key, or a program that a person signed in. */
const signedIn = (caller: Caller): boolean => caller.kind === 'user' || caller.kind === 'key' || caller.kind === 'mcp'

/**
 * The refusal of a rule, for the caller it kept out: a caller who is nobody is told to sign in (T0006), and a
 * signed-in caller is denied (T3101).
 */
export function refusedBy(name: string, needs: string, caller: Caller): TentError {
  if (caller.kind === 'nobody')
    return new TentError('T0006', `${name} ${needs}; the caller is not signed in.`, {
      fix: 'Sign in, and call it again.',
    })
  return new TentError('T3101', `${name} ${needs}; the caller is signed in and the rule does not let them in.`, {
    fix: 'Call it as a caller that its rule lets in, or change its `access`.',
  })
}

/**
 * Takes the rule of a function as the description stores it, and the caller. Answers the name of the rule and what
 * it says of the caller: `in`, `out` with the words of what it needs, or `asks`, for a rule made with `allow`,
 * which is asked once the input is checked. A function with no rule is open to nobody. The system passes every rule.
 */
export function ruled(
  access: unknown,
  caller: Caller,
): { rule: string; says: 'in' | 'asks' } | { rule: string; needs: string } {
  const record: Record<string, unknown> = Object(access)
  const rule = typeof record.rule === 'string' ? record.rule : 'nobody'
  if (caller.kind === 'system') return { rule, says: 'in' }
  switch (rule) {
    case 'anyone':
      return { rule, says: 'in' }
    case 'signedIn':
      return signedIn(caller) ? { rule, says: 'in' } : { rule, needs: 'needs a signed-in caller' }
    case 'role':
      return rolesOf(caller).includes(String(record.role))
        ? { rule, says: 'in' }
        : { rule, needs: `needs role '${String(record.role)}'` }
    case 'allow':
      return { rule, says: 'asks' }
    default:
      return { rule, needs: 'is open to nobody' }
  }
}
