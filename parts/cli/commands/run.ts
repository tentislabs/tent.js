import { boolean, text } from '../../core/index.ts'
import type { Command } from '../command.ts'
import { asked } from '../reach.ts'

/**
 * Calls a function of the app, as a user by its id, as `nobody`, or as the system where nobody is named, and
 * answers what it answered with the lines its code wrote into the log. With `--times <from> <to>` it makes up the
 * schedule of a flow: one run for each of its times between the two moments, each handed its time as `event.at`,
 * in their order and held by the flow's `together` and `pace`; `--dry` lists them, and more than 100 are started
 * only with `--yes`. With no engine running it starts one for the length of the command.
 */
export const command: Command = {
  name: 'run',
  args: {
    name: text(),
    // The second moment of `--times`, which stands after the first.
    to: text({ optional: true }),
    with: text({ optional: true }),
    as: text({ optional: true }),
    times: text({ optional: true }),
    dry: boolean({ optional: true }),
    yes: boolean({ optional: true }),
    data: text({ optional: true }),
  },
  needs: 'engine',
  run: async ({ args, folder }) => {
    if ((args.times === undefined) !== (args.to === undefined))
      throw new Error('`--times` takes two moments: tent run <flow> --times <from> <to>.')
    if (typeof args.times === 'string')
      return asked({ folder, data: args.data }, 'runs', {
        what: 'start',
        flow: args.name,
        times: args.times,
        to: args.to,
        ...(args.dry === true ? { dry: true } : {}),
        ...(args.yes === true ? { yes: true } : {}),
      })
    let input: unknown = {}
    if (typeof args.with === 'string')
      try {
        input = JSON.parse(args.with)
      } catch {
        throw new Error(`What stands after --with is no JSON: ${args.with.slice(0, 80)}`)
      }
    const as = typeof args.as === 'string' ? { as: args.as } : {}
    return asked({ folder, data: args.data }, 'run', { name: args.name, with: input, ...as })
  },
}
