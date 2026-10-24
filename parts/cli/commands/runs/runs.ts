import { boolean, text } from '../../../core/index.ts'
import type { Command } from '../../command.ts'
import { operatedAt } from '../../operated.ts'

/** Lists the newest runs of the flows of the app, of the shared file, of the file of one tenant with `--of`, or of every file with `--all`: the id of each, its flow, its state, its version, and the step it waits at. */
export const command: Command = {
  name: 'runs',
  args: {
    of: text({ optional: true }),
    all: boolean({ optional: true }),
    data: text({ optional: true }),
    at: text({ optional: true }),
    insecure: text({ optional: true }),
  },
  needs: 'engine',
  run: async ({ args, folder }) =>
    operatedAt({ folder, data: args.data, at: args.at, insecure: args.insecure }, 'runs', {
      what: 'list',
      ...(typeof args.of === 'string' ? { of: args.of } : {}),
      ...(args.all === true ? { all: true } : {}),
    }),
}
