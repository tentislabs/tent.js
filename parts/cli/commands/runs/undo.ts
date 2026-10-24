import { boolean, text } from '../../../core/index.ts'
import type { Command } from '../../command.ts'
import { asked } from '../../reach.ts'

/**
 * Takes back every row that a run wrote, and with `--started` what the runs it started wrote, and names what it
 * left and what stays done outside the app. `--dry` says what it would do, and changes nothing.
 */
export const command: Command = {
  name: 'runs undo',
  args: {
    id: text(),
    started: boolean({ optional: true }),
    dry: boolean({ optional: true }),
    data: text({ optional: true }),
  },
  needs: 'engine',
  run: async ({ args, folder }) =>
    asked({ folder, data: args.data }, 'runs', {
      what: 'undo',
      id: args.id,
      ...(args.started === true ? { started: true } : {}),
      ...(args.dry === true ? { dry: true } : {}),
    }),
}
