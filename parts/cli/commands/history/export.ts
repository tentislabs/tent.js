import { resolve } from 'node:path'
import { list, text } from '../../../core/index.ts'
import type { Command } from '../../command.ts'
import { historyAsked } from '../../historyAsked.ts'

/**
 * Writes the named, the published and the merge points of the history as commits into the folder that `--out`
 * names, oldest first, with the `git` program of the computer. `--kinds` names other kinds of point to write.
 * Answers the count of commits, and says what git does not hold.
 */
export const command: Command = {
  name: 'history export',
  args: { out: text(), kinds: list(text(), { optional: true }), data: text({ optional: true }) },
  needs: 'project',
  run: async ({ args, folder }) => ({
    value: await historyAsked(
      { folder, data: args.data },
      {
        what: 'export',
        out: resolve(folder, String(args.out)),
        ...(Array.isArray(args.kinds) ? { kinds: args.kinds.flatMap((one) => String(one).split(',')) } : {}),
      },
    ),
  }),
}
