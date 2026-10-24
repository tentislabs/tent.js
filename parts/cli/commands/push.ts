import { boolean, text } from '../../core/index.ts'
import type { Command } from '../command.ts'
import { historyAsked } from '../historyAsked.ts'

/**
 * Sends the points of the branch that `now` follows that the server lacks, oldest first, and moves the server's
 * branch of that name. Where someone else pushed since, the server merges what touched other paths, and refuses
 * with T9103 where both touched one: `tent pull` first. A head that holds no word of the check is checked first;
 * one that did not pass is T9101, unless `--unchecked`.
 */
export const command: Command = {
  name: 'push',
  args: {
    to: text({ optional: true }),
    unchecked: boolean({ optional: true }),
    insecure: text({ optional: true }),
    data: text({ optional: true }),
  },
  needs: 'project',
  run: async ({ args, folder }) => {
    const { data, ...rest } = args
    return { value: await historyAsked({ folder, data }, { what: 'push', ...rest }) }
  },
}
