import { boolean, text } from '../../../core/index.ts'
import type { Command } from '../../command.ts'
import { asked } from '../../reach.ts'

const flags = ['behind', 'unswept', 'due', 'stray', 'sweep'] as const

/**
 * Prints the directory of the data files of tenants, read through the engine. `--behind`, `--unswept` and `--due`
 * narrow it, `--stray` has the upkeep done at once, `--sweep` sweeps every file that is unswept, and `--retry`
 * tries a file again that could not be brought up.
 */
export const command: Command = {
  name: 'data files',
  args: {
    behind: boolean({ optional: true }),
    unswept: boolean({ optional: true }),
    due: boolean({ optional: true }),
    stray: boolean({ optional: true }),
    sweep: boolean({ optional: true }),
    retry: text({ optional: true }),
    data: text({ optional: true }),
  },
  needs: 'engine',
  run: async ({ args, folder }) =>
    asked({ folder, data: args.data }, 'data', {
      what: 'files',
      ...Object.fromEntries(flags.filter((flag) => args[flag] === true).map((flag) => [flag, true])),
      ...(typeof args.retry === 'string' ? { retry: args.retry } : {}),
    }),
}
