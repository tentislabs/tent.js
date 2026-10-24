import { boolean, number, text } from '../../core/index.ts'
import { finding } from '../../core/internal.ts'
import type { Command } from '../command.ts'
import { askedOfRunning } from '../reach.ts'

/**
 * `tent shot <address>`: a picture of a screen of the app that runs, as nobody, taken by a browser that is already
 * on the computer. It asks the running engine, and with none running it starts none, and says which command does.
 */
export const command: Command = {
  name: 'shot',
  args: {
    address: text(),
    size: text({ optional: true, pattern: '^\\d{2,5}x\\d{2,5}$' }),
    full: boolean({ optional: true }),
    dark: boolean({ optional: true }),
    out: text({ optional: true }),
    wait: number({ optional: true, min: 0, whole: true }),
    data: text({ optional: true }),
  },
  needs: 'engine',
  run: async ({ args, folder }) => {
    const { data, ...asked } = args
    return (
      (await askedOfRunning({ folder, data }, 'shot', asked)) ?? {
        findings: [
          finding('T0013', 'No engine runs on the data folder: a picture is taken of an app that runs.', {
            fix: 'Start the app with `tent dev` or `tent start`, and type the command again in another terminal.',
          }),
        ],
      }
    )
  },
}
