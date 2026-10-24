import { enginePort } from '../engineFile.ts'
import type { Admin } from '../admin.ts'
import { makeInspectToken } from '../inspected.ts'

/**
 * `inspect: { framedBy, for }`: makes a token of the inspect mode for a tool of that origin, and answers the whole
 * address of the app on this computer with it, as `tent dev --inspect` prints it. The port is the one that the
 * engine wrote for the commands of this computer.
 */
export const admin: Admin = {
  name: 'inspect',
  async run(o, args) {
    const token = makeInspectToken(o, args)
    return {
      address: `http://localhost:${enginePort(o.dataFolder)}/?t-inspect=${token}`,
      framedBy: Reflect.get(args, 'framedBy'),
    }
  },
}
