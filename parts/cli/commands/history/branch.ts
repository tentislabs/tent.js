import { boolean, text } from '../../../core/index.ts'
import { fieldsOf } from '../../answerShapes.ts'
import type { Command } from '../../command.ts'
import { historyAsked } from '../../historyAsked.ts'
import { withText } from '../../print.ts'

/** The branches as lines: each with the first eight characters of its point, and a star at the one that is followed. */
function linesOf(value: Record<string, unknown>): string {
  return Object.entries(fieldsOf(value.branches))
    .map(([name, point]) => `${name === value.on ? '*' : ' '} ${name}  ${String(point).slice(0, 8)}`)
    .join('\n')
}

/**
 * With no name, lists the branches, with the one that is followed. With a name, makes a branch at `now`; with
 * `--switch` it goes to it, making it first where it is not there: it records the present, writes the files of
 * the branch as going back does, and the data follows them.
 */
export const command: Command = {
  name: 'history branch',
  args: { name: text({ optional: true }), switch: boolean({ optional: true }), data: text({ optional: true }) },
  needs: 'project',
  run: async ({ args, folder }) => {
    const at = { folder, data: args.data }
    if (args.switch === true && typeof args.name === 'string')
      return { value: await historyAsked(at, { what: 'switch', name: args.name }) }
    const value = fieldsOf(
      await historyAsked(at, { what: 'branch', ...(typeof args.name === 'string' ? { name: args.name } : {}) }),
    )
    return { value: withText(value, linesOf(value)) }
  },
}
