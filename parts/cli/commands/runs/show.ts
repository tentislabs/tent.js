import { text } from '../../../core/index.ts'
import type { Command } from '../../command.ts'
import { operatedAt } from '../../operated.ts'

/** Prints one run in full: its flow, its state, who started it, what it was handed and answered, and each step with its result. */
export const command: Command = {
  name: 'runs show',
  args: {
    id: text(),
    data: text({ optional: true }),
    at: text({ optional: true }),
    insecure: text({ optional: true }),
  },
  needs: 'engine',
  run: async ({ args, folder }) =>
    operatedAt({ folder, data: args.data, at: args.at, insecure: args.insecure }, 'runs', {
      what: 'show',
      id: args.id,
    }),
}
