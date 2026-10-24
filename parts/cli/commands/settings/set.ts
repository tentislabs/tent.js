import { boolean, text } from '../../../core/index.ts'
import type { Command } from '../../command.ts'
import { valuesTold } from '../../values.ts'

/**
 * Sets a setting of the project, held to its type: a text as it is typed, and any other type read as JSON. It
 * sets the value of test data, and with `--live` that of live data.
 */
export const command: Command = {
  name: 'settings set',
  args: {
    name: text(),
    value: text(),
    live: boolean({ optional: true }),
    data: text({ optional: true }),
    to: text({ optional: true }),
    insecure: text({ optional: true }),
  },
  needs: 'project',
  run: async ({ args, folder }) =>
    valuesTold(
      { folder, data: args.data, to: args.to, insecure: args.insecure },
      {
        kind: 'settings',
        name: String(args.name),
        value: String(args.value),
        written: true,
        ...(args.live === true ? { live: true } : {}),
      },
    ),
}
