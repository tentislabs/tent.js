import { choice, text } from '../../../core/index.ts'
import type { Command } from '../../command.ts'
import { asked } from '../../reach.ts'

/**
 * `add` gives a user a role, and `remove` takes one away, as the handle `roles` does. It prints the roles that
 * the user has from then on.
 */
export const command: Command = {
  name: 'access role',
  args: { do: choice(['add', 'remove']), user: text(), role: text(), data: text({ optional: true }) },
  needs: 'engine',
  run: async ({ args, folder }) =>
    asked({ folder, data: args.data }, 'access-role', { do: args.do, user: args.user, role: args.role }),
}
