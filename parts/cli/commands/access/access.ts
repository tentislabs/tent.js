import { text } from '../../../core/index.ts'
import type { Command } from '../../command.ts'
import { asked } from '../../reach.ts'

/** Prints one table of who can do what: every table rule and every function rule. */
export const command: Command = {
  name: 'access',
  args: { data: text({ optional: true }) },
  needs: 'engine',
  run: async ({ args, folder }) => asked({ folder, data: args.data }, 'access', {}),
}
