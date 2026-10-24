import type { Admin } from '../admin.ts'

/**
 * `described`, a command of the channel's own: the description of the version that runs, which `tent impact` holds
 * the project as it stands against.
 */
export const admin: Admin = {
  name: 'described',
  async run(o) {
    return o.description
  },
}
