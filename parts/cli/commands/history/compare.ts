import { text } from '../../../core/index.ts'
import { fieldsOf, isChange, isImpact } from '../../answerShapes.ts'
import { lineOf } from '../../../history/index.ts'
import type { Command } from '../../command.ts'
import { historyAsked } from '../../historyAsked.ts'
import { withText } from '../../print.ts'
import { impactText } from '../../../publish/index.ts'

/**
 * Prints the changes from one point to another, in the terms of the app, one to a line. Each of the two is `now`,
 * a name, or the first 8 or more characters of an id. With `--json` it prints the records of the changes.
 */
export const command: Command = {
  name: 'history compare',
  args: { a: text(), b: text(), data: text({ optional: true }) },
  needs: 'project',
  run: async ({ args, folder }) => {
    const value = fieldsOf(
      await historyAsked({ folder, data: args.data }, { what: 'compare', a: String(args.a), b: String(args.b) }),
    )
    const changes = Array.isArray(value.changes) ? value.changes.filter(isChange) : []
    const text = changes.length ? changes.map(lineOf).join('\n') : 'Nothing changed.'
    // A published point holds the impact that its publish printed: it stands beside what changed.
    const impact = isImpact(value.impact) ? value.impact : undefined
    return { value: withText(changes, impact ? `${text}\n\n${impactText(impact)}` : text) }
  },
}
