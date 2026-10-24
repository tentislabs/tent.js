import { text } from '../../../core/index.ts'
import type { Command } from '../../command.ts'
import { historyAsked } from '../../historyAsked.ts'

/**
 * Goes back to a point: records the present, writes the files of the point, and records a point of the kind
 * `back`, so that going back can itself be undone. The data follows: what the older files do not know is retired,
 * and nothing is dropped. Answers the `back` point, the version that runs, and what cannot be brought back.
 */
export const command: Command = {
  name: 'history back',
  args: { point: text(), data: text({ optional: true }) },
  needs: 'project',
  run: async ({ args, folder }) => ({
    value: await historyAsked({ folder, data: args.data }, { what: 'back', point: String(args.point) }),
  }),
}
