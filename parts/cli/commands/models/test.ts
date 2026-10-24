import { text } from '../../../core/index.ts'
import type { Command } from '../../command.ts'
import { asked } from '../../reach.ts'

/**
 * Sends one small request for each fixed call that a model has, to its real server, and says of each call whether
 * the server answered it, with the code where it did not, and whether the reasoning of the model arrived. With a name
 * it tries that model alone. It is run by hand: nothing calls a provider by itself.
 */
export const command: Command = {
  name: 'models test',
  args: { name: text({ optional: true }), data: text({ optional: true }) },
  needs: 'engine',
  run: async ({ args, folder }) =>
    asked({ folder, data: args.data }, 'models', {
      test: true,
      ...(typeof args.name === 'string' ? { name: args.name } : {}),
    }),
}
