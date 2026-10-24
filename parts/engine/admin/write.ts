import type { Admin } from '../admin.ts'
import { badWord } from '../admin.ts'
import { callerWritten } from '../program.ts'

/**
 * `write`, a command of the channel's own for the host of an engine in a box: a list of writes carried out as
 * `app.write` carries it out, as one write under the rules of the caller that `as` names in a word, and as the
 * system where it names none. Answers the row of each.
 */
export const admin: Admin = {
  name: 'write',
  async run(o, args) {
    const writes: unknown = Reflect.get(args, 'writes')
    if (!Array.isArray(writes)) throw badWord('writes', 'a list of writes, as a table gives them')
    const as: unknown = Reflect.get(args, 'as')
    return o.app.write(writes.map(Object), { as: callerWritten(o, typeof as === 'string' ? as : 'system') })
  },
}
