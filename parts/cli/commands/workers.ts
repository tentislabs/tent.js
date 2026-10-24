import { text } from '../../core/index.ts'
import type { Command } from '../command.ts'
import { askedOfRunning, noneRuns } from '../reach.ts'

/**
 * Lists the workers that are joined to a running writer, each with its kinds and what it works on, and for each kind
 * what waits and what is out. `--release <id>` hands that worker nothing more. It starts no engine.
 */
export const command: Command = {
  name: 'workers',
  args: { data: text({ optional: true }), release: text({ optional: true }) },
  needs: 'engine',
  run: async ({ args, folder }) =>
    (await askedOfRunning(
      { folder, data: args.data },
      'workers',
      typeof args.release === 'string' ? { release: args.release } : {},
    )) ?? noneRuns('workers'),
}
