import { text } from '../../../core/index.ts'
import type { Command } from '../../command.ts'
import { asked } from '../../reach.ts'

/** Prints every row of a table, with full access, read through the engine. `--of` names the tenant of a tenant table. */
export const command: Command = {
  name: 'data rows',
  args: { table: text(), of: text({ optional: true }), data: text({ optional: true }) },
  needs: 'engine',
  run: async ({ args, folder }) =>
    asked({ folder, data: args.data }, 'data', {
      what: 'rows',
      table: args.table,
      ...(typeof args.of === 'string' ? { of: args.of } : {}),
    }),
}
