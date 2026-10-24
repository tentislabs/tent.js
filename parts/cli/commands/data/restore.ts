import { resolve } from 'node:path'
import { boolean, text } from '../../../core/index.ts'
import type { Command } from '../../command.ts'
import { asked } from '../../reach.ts'

/**
 * Has the engine put the file of a backup back under the running app; or with `--at` bring every data file to a
 * moment, from a backup and the archive, and with `--dry` say what it would do.
 */
export const command: Command = {
  name: 'data restore',
  args: {
    file: text({ optional: true }),
    of: text({ optional: true }),
    at: text({ optional: true }),
    dry: boolean({ optional: true }),
    data: text({ optional: true }),
  },
  needs: 'engine',
  run: async ({ args, folder }) =>
    asked({ folder, data: args.data }, 'data', {
      what: 'restore',
      ...(typeof args.file === 'string' ? { file: resolve(folder, String(args.file)) } : {}),
      ...(typeof args.of === 'string' ? { of: args.of } : {}),
      ...(typeof args.at === 'string' ? { at: args.at } : {}),
      ...(args.dry === true ? { dry: true } : {}),
    }),
}
