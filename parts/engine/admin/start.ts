import type { Admin } from '../admin.ts'
import { badWord, wordOf } from '../admin.ts'
import { callerWritten } from '../program.ts'

/**
 * `start`, a command of the channel's own for the host of an engine in a box: a run of a flow or an agent
 * started as `app.start` starts one, as the caller that `as` names in a word, a user id, `nobody` or `system`, and
 * the system where it names none. `limits` may make the limits of an agent smaller. Answers `{ run }`.
 */
export const admin: Admin = {
  name: 'start',
  async run(o, args) {
    const name = wordOf(args, 'name', 'the name of a flow or an agent')
    const as: unknown = Reflect.get(args, 'as')
    if (as !== undefined && typeof as !== 'string') throw badWord('as', 'a user id, `nobody` or `system`')
    const limits: unknown = Reflect.get(args, 'limits')
    return o.app.start(name, Reflect.get(args, 'input') ?? {}, {
      as: callerWritten(o, as ?? 'system'),
      ...(typeof limits === 'object' && limits !== null ? { limits: Object(limits) } : {}),
    })
  },
}
