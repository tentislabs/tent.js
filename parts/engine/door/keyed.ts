import type { Caller } from '../../core/index.ts'
import type { Address } from './address.ts'
import { logCall } from './failure.ts'
import type { Opened } from '../opened.ts'
import { errorAnswer } from '../wire.ts'
import type { ReaderKey } from '../copy/keys.ts'

/** The caller that the log names for a request with the key of a reader: the key, by its id. */
const keyCaller = (key: ReaderKey): Caller => ({ kind: 'key', key: { id: key.id, scopes: [], roles: [] } })

/**
 * Writes the row of `calls` of one request to an address of the link: of the kind `copy`, with the id of its key
 * as its caller, and for a failure its code.
 */
export function logCopy(o: Opened, name: string, key: ReaderKey, began: number, error?: unknown): void {
  logCall(o, { name, kind: 'copy', caller: keyCaller(key), began, ...(error === undefined ? {} : { error }) })
}

/**
 * Takes what an address of the link is handed, its name in the log, and what answers the request for the key it
 * carries. Holds the request to the key of a reader, which stands in place of a caller, has it answered, and
 * writes its row of the log. A request with no key of a reader finds nothing, as at any address that is not
 * there, and writes no row. `refused` answers a failure where the address has a form of its own for one.
 */
export async function keyed(
  reached: Parameters<Address['handle']>[0],
  name: string,
  work: (key: ReaderKey) => Response | Promise<Response>,
  refused?: (error: unknown) => Response,
): Promise<Response> {
  const { app, request, about, began } = reached
  let key: ReaderKey
  try {
    // An app on one machine becomes the writer of a link at the first request of a reader with a key of its own.
    await app.machine.joinable?.(request)
    key = app.machine.keyed(request, about)
  } catch (error) {
    return errorAnswer(app, name, error)
  }
  try {
    const answer = await work(key)
    logCopy(app, name, key, began)
    return answer
  } catch (error) {
    logCopy(app, name, key, began, error)
    return refused ? refused(error) : errorAnswer(app, name, error)
  }
}
