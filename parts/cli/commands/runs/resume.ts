import { text } from '../../../core/index.ts'
import type { Command } from '../../command.ts'
import { asked } from '../../reach.ts'

/** Resumes a paused flow: what waited while it was paused goes, in its order. */
export const command: Command = {
  name: 'runs resume',
  args: { flow: text(), data: text({ optional: true }) },
  needs: 'engine',
  run: async ({ args, folder }) => asked({ folder, data: args.data }, 'runs', { what: 'resume', flow: args.flow }),
}
