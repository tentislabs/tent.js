import type { Finding } from '../../../core/index.ts'
import { fullAccessIn, waitedFor } from '../../fullAccess.ts'
import type { Rule } from '../../rule.ts'
import { arrowOf, at, writtenIn } from '../../rule.ts'

/**
 * Full access that a flow which runs as its starter uses: each thing that the list of full access holds, and a flow
 * with full access that it calls and waits for. Such a run has the rights of its caller alone, `system` or not.
 */
export const rule: Rule = {
  code: 'T3004',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    for (const one of writtenIn(source).filter((each) => each.word === 'flow')) {
      const flow = Object.hasOwn(description.flows, one.name) ? description.flows[one.name] : undefined
      const run = arrowOf(one, 'run')
      if (flow?.as !== 'starter' || !run) continue
      const fix = "Leave out `as: 'starter'`, so that the flow has full access, or call an action that states `system`."
      for (const [what, node] of fullAccessIn(run, source))
        found.push(
          at(
            'T3004',
            one,
            node,
            `it uses ${what}, which is full access, and runs as its starter, so it has the rights of its caller alone and fails there while it runs.`,
            fix,
          ),
        )
      for (const [name, node] of waitedFor(run, description))
        found.push(
          at(
            'T3004',
            one,
            node,
            `it calls the flow \`${name}\` and waits for it. That flow has full access, and this flow runs as its starter, so the call fails while it runs.`,
            fix,
          ),
        )
    }
    return found
  },
}
