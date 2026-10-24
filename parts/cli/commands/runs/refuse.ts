import { text } from '../../../core/index.ts'
import type { Command } from '../../command.ts'
import { operatedAt } from '../../operated.ts'

/** Says no to a step of a run that waits for an answer: the run goes on, and its flow reads the no. */
export const command: Command = {
  name: 'runs refuse',
  args: {
    id: text(),
    step: text(),
    data: text({ optional: true }),
    at: text({ optional: true }),
    insecure: text({ optional: true }),
  },
  needs: 'engine',
  run: async ({ args, folder }) =>
    operatedAt({ folder, data: args.data, at: args.at, insecure: args.insecure }, 'runs', {
      what: 'refuse',
      id: args.id,
      step: args.step,
    }),
}
