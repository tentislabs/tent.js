import { boolean, text } from '../../core/index.ts'
import type { Command } from '../command.ts'
import { historyAsked } from '../historyAsked.ts'

/**
 * Fetches the points of the server's branch of the name that `now` follows and merges them into the files: a pull
 * is always a merge, and never an overwrite. What clashes arrives in `tent.clash.ts`. What was written is built and
 * checked afterwards, and the point marked with what was found.
 */
export const command: Command = {
  name: 'pull',
  args: {
    to: text({ optional: true }),
    unchecked: boolean({ optional: true }),
    insecure: text({ optional: true }),
    data: text({ optional: true }),
  },
  needs: 'project',
  run: async ({ args, folder }) => {
    const { data, ...rest } = args
    return { value: await historyAsked({ folder, data }, { what: 'pull', ...rest }) }
  },
}
