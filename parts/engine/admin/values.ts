import type { Admin } from '../admin.ts'
import { badWord } from '../admin.ts'

/**
 * `values`, a command of the channel's own for the host of an engine in a box: sets, removes or lists the names of
 * the secrets and the settings of the app's mode, as `app.values` does. A list answers the names, and never a value.
 */
export const admin: Admin = {
  name: 'values',
  async run(o, args) {
    const kind: unknown = Reflect.get(args, 'kind')
    if (kind !== 'secret' && kind !== 'setting') throw badWord('kind', '`secret` or `setting`')
    const name: unknown = Reflect.get(args, 'name')
    return o.app.values({
      kind,
      ...(typeof name === 'string' ? { name } : {}),
      ...(Reflect.has(args, 'value') ? { value: Reflect.get(args, 'value') } : {}),
      ...(Reflect.get(args, 'remove') === true ? { remove: true } : {}),
      ...(Reflect.get(args, 'list') === true ? { list: true } : {}),
    })
  },
}
