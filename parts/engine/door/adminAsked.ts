// What a command of the admin channel is asked with: the token, where it came from, and the record of its words.
import { TentError } from '../../core/index.ts'
import { sameSecret } from '../../core/index.ts'
import { bearerOf } from '../bearer.ts'
import { bodyOf } from '../web/body.ts'
import { readJson } from '../web/json.ts'
import type { About } from '../web/proxy.ts'
import { fromCommands } from './adminCaller.ts'
import { isWritten } from '../../core/internal.ts'

/** What every refusal of the channel says, so that it tells nothing of what was wrong. */
export const adminClosed = (): TentError =>
  new TentError('T0006', 'The commands of an engine are for whoever started it.', {
    fix: 'Type the command on the computer that runs the engine, as the user who started it.',
  })

/**
 * Takes the request of a command, what the engine knows of where it came from, the admin token and the most bytes
 * its body may hold. Answers the words of the command, `args` of its body. Throws T0006 for a request without the
 * token, or of another computer or through a proxy, and T0002 for a body that is no `{ "args": { ... } }`.
 */
export async function adminWords(
  request: Request,
  about: About,
  token: string,
  size: number,
): Promise<Record<string, unknown>> {
  // The token is compared for every request, also one that is refused for where it came from.
  const tokened = sameSecret(bearerOf(request), token)
  if (!fromCommands(about) || !tokened) throw adminClosed()
  const body = readJson(await bodyOf(request, size))
  if (!isWritten(body) || !isWritten(body.args) || Object.keys(body).length !== 1)
    throw new TentError('T0002', 'The body of a command is one record: { "args": { ... } }.', {
      fields: { args: 'type' },
    })
  return body.args
}
