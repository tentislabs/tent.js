import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'

/** Whether a key holds a scope: the name itself, or `'*'`, which names every function, route and the files. */
export const holdsScope = (caller: Caller, scope: string): boolean =>
  caller.kind !== 'key' || !caller.key || caller.key.scopes.includes(scope) || caller.key.scopes.includes('*')

/**
 * Part of step 6 of the door, for a caller that is a key: what it asks for must be named by its scopes. They hold
 * at the call that came through the door, and not for what that call calls from code. Throws T3101.
 */
export function inScope(caller: Caller, name: string): void {
  if (holdsScope(caller, name)) return
  throw new TentError('T3101', `${name.slice(0, 80)} is outside the scopes of the key that called it.`, {
    fix: 'Make a key whose scopes name it, or call it with a key that has them.',
  })
}

/**
 * The caller of a request for a screen, of `/_t/screen` and of `/_t/form/`: a key is nobody there, unless it holds
 * the scope `'screens'`, for a program that reads what a person would be shown. `'*'` does not name it.
 */
export const screenCaller = (caller: Caller): Caller =>
  caller.kind === 'key' && !caller.key?.scopes.includes('screens') ? { kind: 'nobody' } : caller
