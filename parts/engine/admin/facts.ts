import type { Admin } from '../admin.ts'
import { badWord } from '../admin.ts'
import { isDescription } from '../facts.ts'

/**
 * `facts`, a command of the channel's own: the `Facts` of the check, for the description that `tent check` made
 * of the files of the project as they now stand, or for the one of the running version where none is handed in.
 */
export const admin: Admin = {
  name: 'facts',
  async run(o, args) {
    const description: unknown = Reflect.get(args, 'description')
    if (description === undefined) return o.app.facts()
    if (!isDescription(description)) throw badWord('description', 'the description of a project')
    return o.app.facts(description)
  },
}
