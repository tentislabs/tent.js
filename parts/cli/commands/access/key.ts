import { choice, number, text } from '../../../core/index.ts'
import type { Command } from '../../command.ts'
import { asked } from '../../reach.ts'

/**
 * `add <name>` makes a key and prints it once, `list` prints every key without it, and `remove <id>` removes one.
 * `--scopes` and `--roles` are names with commas between; `--user` makes the key that user's, `--for` ends it.
 * `--right` makes a key of publishing: `read`, `push` or `publish`, each holding the ones before it, `bundle`, or a
 * list of rights with commas between, which the key then holds exactly. A key of the right `work` is bound to
 * the kinds of `--kinds`, to `--at-once` tasks for one worker, and to `--workers` workers, 1 where it states none.
 */
export const command: Command = {
  name: 'access key',
  args: {
    do: choice(['add', 'list', 'remove']),
    name: text({ optional: true }),
    scopes: text({ optional: true }),
    roles: text({ optional: true }),
    user: text({ optional: true }),
    'per-minute': number({ optional: true }),
    for: text({ optional: true }),
    asks: text({ optional: true }),
    right: text({ optional: true }),
    kinds: text({ optional: true }),
    'at-once': number({ optional: true }),
    workers: number({ optional: true }),
    data: text({ optional: true }),
  },
  needs: 'engine',
  run: async ({ args, folder }) => {
    const { data, 'per-minute': perMinute, 'at-once': atOnce, ...rest } = args
    return asked({ folder, data }, 'access-key', {
      ...rest,
      ...(perMinute === undefined ? {} : { perMinute }),
      ...(atOnce === undefined ? {} : { atOnce }),
    })
  },
}
