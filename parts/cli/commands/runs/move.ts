import { text } from '../../../core/index.ts'
import type { Command } from '../../command.ts'
import { operatedAt } from '../../operated.ts'

/** Moves a run that has not ended to the version that runs now, where its saved steps still match, and says the step that does not where it stays. */
export const command: Command = {
  name: 'runs move',
  args: {
    id: text(),
    data: text({ optional: true }),
    at: text({ optional: true }),
    insecure: text({ optional: true }),
  },
  needs: 'engine',
  run: async ({ args, folder }) =>
    operatedAt({ folder, data: args.data, at: args.at, insecure: args.insecure }, 'runs', {
      what: 'move',
      id: args.id,
    }),
}
