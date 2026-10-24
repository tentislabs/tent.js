import { boolean, text } from '../../../core/index.ts'
import { fieldsOf, textsOf } from '../../answerShapes.ts'
import type { Command } from '../../command.ts'
import { historyAsked } from '../../historyAsked.ts'
import { withText } from '../../print.ts'

/** What a merge prints: the line of each change, and how many things clashed. */
function linesOf(value: Record<string, unknown>): string {
  const lines = textsOf(value.lines)
  const clashes = Array.isArray(value.clashes) ? value.clashes.length : 0
  if (clashes) lines.push(`${clashes} ${clashes === 1 ? 'thing clashes' : 'things clash'}: see tent.clash.ts.`)
  if (!lines.length) lines.push('Nothing to merge.')
  if (value.merged === false) lines.push('Nothing was merged: type --yes to merge.')
  return lines.join('\n')
}

/**
 * Merges a branch into the files. It first prints what the merge would change, in the terms of compare, and what
 * would clash, and merges only with `--yes`. A clean merge is built and checked, and its point marked with what
 * was found; a merge with clashes writes `tent.clash.ts`. `--settle` records the point once the clashes are
 * settled, and is T9102 while the clash file or a `.theirs` file is there.
 */
export const command: Command = {
  name: 'history merge',
  args: {
    from: text({ optional: true }),
    yes: boolean({ optional: true }),
    settle: boolean({ optional: true }),
    unchecked: boolean({ optional: true }),
    data: text({ optional: true }),
  },
  needs: 'project',
  run: async ({ args, folder }) => {
    const at = { folder, data: args.data }
    if (args.settle === true) return { value: await historyAsked(at, { what: 'settle' }) }
    const from = String(args.from ?? '')
    const asked = {
      what: 'merge',
      from,
      ...(args.yes === true ? {} : { dry: true }),
      ...(args.unchecked === true ? { unchecked: true } : {}),
    }
    const value = fieldsOf(await historyAsked(at, asked))
    return { value: withText(value, linesOf(value)) }
  },
}
