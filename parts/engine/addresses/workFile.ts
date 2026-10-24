import type { Address } from '../door/address.ts'
import { noLink } from '../noLink.ts'

const prefix = '/_t/work/file'

/**
 * `GET /_t/work/file/<fingerprint or file id>?task=<id>`: the bytes of a file, for a task that is out to the
 * worker of this key: by its fingerprint a file that the task names, and by its id a file that the caller of the
 * task may download. `POST /_t/work/file?task=<id>&kind=<kind>` stores what the work made as a loose file of the
 * starter of the task's run, under a name of the engine's own, and with `carry=1` a value too large for a frame.
 * Not found for any other.
 */
export const address: Address = {
  order: 1,
  match: (request) => {
    const { pathname } = new URL(request.url)
    return (pathname === prefix || pathname.startsWith(`${prefix}/`)) && {}
  },
  steps: [1, 2, 3, 10],
  // The key check of a worker is loaded by the first request for it: an app with no workers loads none of it.
  handle: async (reached) =>
    (await import('../work/keyedWork.ts')).workKeyed(reached, 'work/file', async (key) => {
      const { request, app } = reached
      if (!app.work) throw noLink()
      const { fileOfTask, takeFile } = await import('../work/fileDoor.ts')
      return request.method === 'POST' ? takeFile(app, key, request) : fileOfTask(app, key, request)
    }),
}
