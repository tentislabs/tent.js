import { boolean, text } from '../../../core/index.ts'
import type { Command } from '../../command.ts'
import { hiddenValue } from '../../hidden.ts'
import { valuesTold } from '../../values.ts'

/**
 * Sets a secret: asks for the value without showing it, or reads it from its input where no person is at the
 * keys. It sets the value of test data, and with `--live` that of live data.
 */
export const command: Command = {
  name: 'secrets set',
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
      {
        kind: 'secrets',
        name: String(args.name),
        value: await hiddenValue(`The value of ${String(args.name)}: `),
        ...(args.live === true ? { live: true } : {}),
      },
    ),
}
