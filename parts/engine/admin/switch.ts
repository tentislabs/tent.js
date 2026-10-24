import type { Admin } from '../admin.ts'
import { wordOf } from '../admin.ts'

/**
 * `switch: { folder }`, a command of the channel's own for the host of an engine in a box: the bundle of that
 * folder added and made the running version, as `tent dev` does after a build. Answers its id and what the switch was.
 */
export const admin: Admin = {
  name: 'switch',
  async run(o, args) {
    const version = await o.app.add(wordOf(args, 'folder', 'the folder of a bundle'))
    return { version, ...(await o.app.switch(version)) }
  },
}
