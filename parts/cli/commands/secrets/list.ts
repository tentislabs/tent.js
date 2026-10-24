import { boolean, text } from '../../../core/index.ts'
import type { Command } from '../../command.ts'
import { valuesTold } from '../../values.ts'

/**
 * `tent secrets list` shows the names of the secrets that are set, and those that a definition names and that are
 * not, and never a value: of test data, and with `--live` of live data.
 */
export const command: Command = {
  name: 'secrets list',
  args: {
    live: boolean({ optional: true }),
    data: text({ optional: true }),
    to: text({ optional: true }),
    insecure: text({ optional: true }),
  },
  needs: 'project',
  run: async ({ args, folder }) =>
    valuesTold(
      { folder, data: args.data, to: args.to, insecure: args.insecure },
      { kind: 'secrets', list: true, ...(args.live === true ? { live: true } : {}) },
    ),
}
