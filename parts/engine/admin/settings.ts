import type { Admin } from '../admin.ts'
import { valuesAsked } from '../values/asked.ts'

/**
 * `tent settings set <name> <value>`, `remove <name>` and `list`, on an engine that runs: the engine writes the
 * file, uses the new value at once, and runs every live group again. A value is held to the type of its setting.
 * On many machines the readers are told, and the command is answered once each uses the new value.
 */
export const admin: Admin = {
  name: 'settings',
  async run(o, args) {
    const answer = valuesAsked(o, 'settings', args)
    // A rule may read a setting: the command is answered once every reader of the app uses what was set.
    if (Reflect.get(args, 'do') !== 'list') await o.machine.writer?.valued()
    return answer
  },
}
