import type { Address } from '../door/address.ts'
import { noLink } from '../noLink.ts'
import { errorAnswer } from '../wire.ts'
import type { WorkerKey } from './keys.ts'
import { bearerOf } from '../bearer.ts'
import { workerKeyIn } from './keys.ts'
import { rowWorkerKey } from './rowKeys.ts'

/**
 * Takes what an address of the link of a worker is handed, its name, and what answers it for the key it carries.
 * The address is answered by a writer that lets workers join, for a request with one of their keys - of `workers`
 * of `open`, or a row of the right `work` - over a
 * connection that is secure or with `insecure`; for every other it is not found.
 */
export async function workKeyed(
  reached: Parameters<Address['handle']>[0],
  name: string,
  work: (key: WorkerKey) => Response | Promise<Response>,
): Promise<Response> {
  const { app, request, about } = reached
  try {
    const sent = bearerOf(request)
    const key = sent === '' || !app.work ? undefined : (workerKeyIn(app.work.keys, sent) ?? rowWorkerKey(app, request))
    if (!key || (about.scheme !== 'https' && !app.machine.insecure)) throw noLink()
    return await work(key)
  } catch (error) {
    return errorAnswer(app, name, error)
  }
}
