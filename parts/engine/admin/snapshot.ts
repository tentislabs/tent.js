import type { Admin } from '../admin.ts'
import { wordOf } from '../admin.ts'

/**
 * `snapshot`, a command of the channel's own for the host of an engine in a box: the data of the app written to
 * the file that `file` names, as `app.snapshot` writes it. Answers `{ writes }`, the number of its last write.
 */
export const admin: Admin = {
  name: 'snapshot',
  run: async (o, args) => o.app.snapshot(wordOf(args, 'file', 'the path of the file to write')),
}
