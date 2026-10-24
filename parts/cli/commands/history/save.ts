import { text } from '../../../core/index.ts'
import type { Command } from '../../command.ts'
import { historyAsked } from '../../historyAsked.ts'

/** Records the files of the project as they are as a named point, which is never dropped. Answers the point. */
export const command: Command = {
  name: 'history save',
  args: { name: text(), data: text({ optional: true }) },
  needs: 'project',
  run: async ({ args, folder }) => ({
    value: await historyAsked({ folder, data: args.data }, { what: 'save', name: String(args.name) }),
  }),
}
