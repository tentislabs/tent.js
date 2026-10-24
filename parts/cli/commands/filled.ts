import { boolean, text } from '../../core/index.ts'
import type { Command } from '../command.ts'
import { asked } from '../reach.ts'

/**
 * Lists every column that work fills, with how many of its values are missing, old and failed. `--look` marks each
 * row whose work would be handed other values, a row written in raw SQL among them, and `--failed <table>.<column>`
 * lists the values that failed with their errors. For a tenant table both take `--of <tenant id>` or
 * `--all`. With no engine running it builds the project and starts one for the length of the command.
 */
export const command: Command = {
  name: 'filled',
  args: {
    data: text({ optional: true }),
    look: boolean({ optional: true }),
    failed: text({ optional: true }),
    of: text({ optional: true }),
    all: boolean({ optional: true }),
  },
  needs: 'engine',
  run: async ({ args, folder }) =>
    asked({ folder, data: args.data }, 'filled', {
      ...(args.look === true ? { look: true } : {}),
      ...(typeof args.failed === 'string' ? { failed: args.failed } : {}),
      ...(typeof args.of === 'string' ? { of: args.of } : {}),
      ...(args.all === true ? { all: true } : {}),
    }),
}
