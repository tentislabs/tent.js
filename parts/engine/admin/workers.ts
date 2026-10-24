import type { Admin } from '../admin.ts'
import { badWord } from '../admin.ts'

/**
 * `tent workers`: each worker that is joined to the writer and each kind with what waits, as `app.workers` and
 * `app.work` answer them. With `release` the worker of that id, or of the id it begins with, is handed nothing more,
 * and the answer says whether it holds no task.
 */
export const admin: Admin = {
  name: 'workers',
  async run(o, args) {
    const hub = o.work
    const release: unknown = Reflect.get(args, 'release')
    if (release !== undefined) {
      if (typeof release !== 'string' || release === '') throw badWord('release', 'the id of a worker')
      const ids = (hub?.workers() ?? []).map((one) => String(Reflect.get(Object(one), 'id')))
      // The list shows 8 characters of an id: those are enough to name a worker by.
      const id = ids.find((one) => one === release) ?? ids.find((one) => one.startsWith(release)) ?? release
      return { released: id, empty: hub?.release(id) === true }
    }
    return { workers: hub?.workers() ?? [], work: hub?.work() ?? [] }
  },
}
