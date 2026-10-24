import { boolean, text } from '../../../core/index.ts'
import type { Command } from '../../command.ts'
import { asked } from '../../reach.ts'

/** Has the engine take a backup of the data into `backups/` of the data folder, and test it. */
export const command: Command = {
  name: 'data backup',
  args: { whole: boolean({ optional: true }), data: text({ optional: true }) },
  needs: 'engine',
  run: async ({ args, folder }) =>
    asked({ folder, data: args.data }, 'data', { what: 'backup', ...(args.whole === true ? { whole: true } : {}) }),
}
