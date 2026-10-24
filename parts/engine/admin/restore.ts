import type { Admin } from '../admin.ts'
import { wordOf } from '../admin.ts'

/**
 * `restore`, a command of the channel's own for the host of an engine in a box: the file of a snapshot that `file`
 * names put back under the running app, as `app.restore` puts it.
 */
export const admin: Admin = {
  name: 'restore',
  async run(o, args) {
    await o.app.restore(wordOf(args, 'file', 'the path of the file of a snapshot'))
    return {}
  },
}
