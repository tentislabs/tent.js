import type { Caller } from '../core/index.ts'
import { fingerprint } from '../core/index.ts'

/**
 * Takes a caller. Answers the caller as one column keeps it: `user:<id>`, `key:<id>`, `grant:<id>` for a program
 * that writes with a grant, `system`, `system:<id>` for a starter of the engine's own, `nobody`, or `visitor:` and
 * the first 32 characters of the fingerprint of the visitor id, which is written nowhere as it is.
 */
export function callerText(caller: Caller): string {
  if (caller.kind === 'system') return caller.starter === undefined ? 'system' : `system:${caller.starter}`
  if (caller.kind === 'key' && caller.key) return `key:${caller.key.id}`
  if (caller.grant) return `grant:${caller.grant.id}`
  if (caller.user) return `user:${caller.user.id}`
  return caller.visitor === undefined ? 'nobody' : `visitor:${fingerprint(caller.visitor).slice(0, 32)}`
}
