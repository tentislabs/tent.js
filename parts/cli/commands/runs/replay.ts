import { boolean, text } from '../../../core/index.ts'
import type { Command } from '../../command.ts'
import { operatedAt } from '../../operated.ts'

/**
 * Starts a new run on the version that runs now, which reuses the saved results of a run before the step that
 * `--from` names. With no id, one for every run of `--flow` that fits `--key`, `--state`, `--since` and `--before`:
 * it says how many first, and replays them with `--yes`.
 */
export const command: Command = {
  name: 'runs replay',
  args: {
    id: text({ optional: true }),
    from: text(),
    flow: text({ optional: true }),
    key: text({ optional: true }),
    state: text({ optional: true }),
    since: text({ optional: true }),
    before: text({ optional: true }),
    yes: boolean({ optional: true }),
    data: text({ optional: true }),
    at: text({ optional: true }),
    insecure: text({ optional: true }),
  },
  needs: 'engine',
  run: async ({ args, folder }) => {
    const { data, at, insecure, ...words } = args
    return operatedAt({ folder, data, at, insecure }, 'runs', { what: 'replay', ...words })
  },
}
