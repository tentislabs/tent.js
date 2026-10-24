import { boolean, text } from '../../../core/index.ts'
import type { Command } from '../../command.ts'
import { valuesTold } from '../../values.ts'

/** Takes a secret away: that of test data, and with `--live` that of live data. */
export const command: Command = {
  name: 'secrets remove',
  args: {
    name: text(),
    live: boolean({ optional: true }),
    data: text({ optional: true }),
    to: text({ optional: true }),
    insecure: text({ optional: true }),
  },
  needs: 'project',
  run: async ({ args, folder }) =>
    valuesTold(
      { folder, data: args.data, to: args.to, insecure: args.insecure },
      { kind: 'secrets', name: String(args.name), remove: true, ...(args.live === true ? { live: true } : {}) },
    ),
}
