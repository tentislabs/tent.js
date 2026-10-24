import type { Admin } from '../admin.ts'
import { badWord } from '../admin.ts'
import { callerWritten } from '../program.ts'

/**
 * `read`, a command of the channel's own for the host of an engine in a box: a plan carried out as `app.read`
 * carries one out, under the rules of the caller that `as` names in a word, and as the system where it names none.
 */
export const admin: Admin = {
  name: 'read',
  async run(o, args) {
    const plan: unknown = Reflect.get(args, 'plan')
    if (typeof plan !== 'object' || plan === null) throw badWord('plan', 'a plan, as a table gives one')
    const as: unknown = Reflect.get(args, 'as')
    return o.app.read(plan, { as: callerWritten(o, typeof as === 'string' ? as : 'system') })
  },
}
