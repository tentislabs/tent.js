import { boolean, text } from '../../../core/index.ts'
import type { Command } from '../../command.ts'
import { operatedAt } from '../../operated.ts'

/**
 * Stops a run that has not ended, at the end of the step it is in. With no id, every run of `--flow` that has not
 * ended and fits `--key`, `--state`, `--since` and `--before`: it says how many first, and stops them with `--yes`.
 */
export const command: Command = {
  name: 'runs stop',
  args: {
    id: text({ optional: true }),
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
    return operatedAt({ folder, data, at, insecure }, 'runs', { what: 'stop', ...words })
  },
}
