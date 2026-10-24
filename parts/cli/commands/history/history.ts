import { number, text } from '../../../core/index.ts'
import { fieldsOf } from '../../answerShapes.ts'
import type { Command } from '../../command.ts'
import { historyAsked } from '../../historyAsked.ts'
import { withText } from '../../print.ts'

/** One point on a line: the first eight characters of its id, its moment, its kind, its name, and what the check found of it. */
function line(shown: unknown): string {
  const point = fieldsOf(shown)
  return [
    String(point.id).slice(0, 8),
    new Date(Number(point.at)).toISOString(),
    String(point.kind),
    ...(typeof point.name === 'string' ? [JSON.stringify(point.name)] : []),
    ...(typeof point.checked === 'boolean' ? [point.checked ? 'checked' : 'not checked'] : []),
  ].join('  ')
}

/**
 * Prints the newest points of the history of the project, newest first, each on a line: thirty of them, or as
 * many as `--newest` says. With `--json` it prints `{ now, points }`.
 */
export const command: Command = {
  name: 'history',
  args: { newest: number({ optional: true }), data: text({ optional: true }) },
  needs: 'project',
  run: async ({ args, folder }) => {
    const value = fieldsOf(
      await historyAsked(
        { folder, data: args.data },
        { what: 'list', ...(typeof args.newest === 'number' ? { newest: args.newest } : {}) },
      ),
    )
    const points: unknown[] = Array.isArray(value.points) ? value.points : []
    return { value: withText(value, points.length ? points.map(line).join('\n') : 'The history holds no point yet.') }
  },
}
