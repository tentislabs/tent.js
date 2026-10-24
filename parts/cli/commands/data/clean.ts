import { text } from '../../../core/index.ts'
import type { Command } from '../../command.ts'
import { asked } from '../../reach.ts'

/** Has the engine drop the tables and the columns that were retired, and nothing else. */
export const command: Command = {
  name: 'data clean',
  args: { data: text({ optional: true }) },
  needs: 'engine',
  run: async ({ args, folder }) => asked({ folder, data: args.data }, 'data', { what: 'clean' }),
}
