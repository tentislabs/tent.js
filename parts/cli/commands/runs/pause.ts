import { text } from '../../../core/index.ts'
import type { Command } from '../../command.ts'
import { asked } from '../../reach.ts'

/** Pauses a flow on every machine: its new starts are kept as queued, and its runs that come due stay waiting. */
export const command: Command = {
  name: 'runs pause',
  args: { flow: text(), data: text({ optional: true }) },
  needs: 'engine',
  run: async ({ args, folder }) => asked({ folder, data: args.data }, 'runs', { what: 'pause', flow: args.flow }),
}
