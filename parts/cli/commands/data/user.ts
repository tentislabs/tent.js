import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { boolean, choice, text } from '../../../core/index.ts'
import type { Command } from '../../command.ts'
import { asked } from '../../reach.ts'

/**
 * `export` prints every row a person owns and their row of `users`, and with `--out` writes it as one JSON file.
 * `remove` shows how many rows of each table are theirs, and removes them once `--yes` is typed.
 */
export const command: Command = {
  name: 'data user',
  args: {
    do: choice(['export', 'remove']),
    id: text(),
    out: text({ optional: true }),
    yes: boolean({ optional: true }),
    data: text({ optional: true }),
  },
  needs: 'engine',
  run: async ({ args, folder }) => {
    const answered = await asked({ folder, data: args.data }, 'data', {
      what: 'user',
      do: args.do,
      id: args.id,
      ...(args.yes === true ? { yes: true } : {}),
    })
    if (typeof args.out === 'string' && args.do === 'export' && answered.value !== undefined)
      writeFileSync(resolve(folder, args.out), `${JSON.stringify(answered.value, null, 2)}\n`)
    return answered
  },
}
