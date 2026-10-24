import { boolean, text } from '../../../core/index.ts'
import type { Command } from '../../command.ts'
import { valuesTold } from '../../values.ts'

/** `tent settings list` shows the settings of the project, each with its value: of test data, and with `--live` of live data. */
export const command: Command = {
  name: 'settings list',
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
      { kind: 'settings', list: true, ...(args.live === true ? { live: true } : {}) },
    ),
}
