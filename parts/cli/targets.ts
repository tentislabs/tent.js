import type { GuardedFetch } from '../connect/index.ts'
import { guardedFetch, publishTarget } from '../connect/index.ts'
import { TentError } from '../core/index.ts'
import { runnerFolder } from '../engine/index.ts'
import type { Target } from '../publish/index.ts'

/**
 * The fetch of a command that reaches a server: on live terms, over a secure connection, but for the host that
 * `--insecure` names, which is reached over a plain one, for two machines on a network of their own.
 */
export const serverFetch = (insecure: unknown): GuardedFetch =>
  guardedFetch({
    mode: 'live',
    ...(typeof insecure === 'string' && insecure !== '' ? { privateHosts: [`http://${insecure}`] } : {}),
  })

/**
 * The target that `--to` names: a name that `tent login` kept, or an address it kept a key for. Throws T0001 where
 * none is kept, with how one is.
 */
export function targetOf(to: unknown): Target & { name: string } {
  const word = typeof to === 'string' ? to : ''
  const found = word === '' ? undefined : publishTarget(runnerFolder(), word)
  if (!found)
    throw new TentError(
      'T0001',
      word === '' ? 'Name the server with `--to <name or address>`.' : `No key is kept for \`${word}\`.`,
      {
        fix: 'Keep the key of the server first: `tent login <address>`, with a key that `tent access key add <name> --right push` made there.',
      },
    )
  return found
}
