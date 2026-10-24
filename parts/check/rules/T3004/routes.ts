import type { Finding } from '../../../core/index.ts'
import { fullAccessIn, waitedFor } from '../../fullAccess.ts'
import type { Rule } from '../../rule.ts'
import { arrowOf, at, writtenIn } from '../../rule.ts'
import { isStored } from '../../../core/internal.ts'

/**
 * Full access that a route uses, and that states no `system`: each thing that the list of full access holds, and a
 * flow with full access that it calls and waits for. Without `system` a route runs as its caller, and fails there.
 */
export const rule: Rule = {
  code: 'T3004',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    for (const one of writtenIn(source).filter((each) => each.word === 'route')) {
      const route = Object.hasOwn(description.routes, one.name) ? description.routes[one.name] : undefined
      const run = arrowOf(one, 'run')
      if (!isStored(route) || route.system !== undefined || !run) continue
      for (const [what, node] of fullAccessIn(run, source))
        found.push(
          at(
            'T3004',
            one,
            node,
            `it uses ${what}, which is full access, and states no \`system\`. Without it the route has none, and fails there while it runs.`,
            "State `system: 'why'` with the reason, or reach the rows through `db`, under the rules of the caller.",
          ),
        )
      for (const [name, node] of waitedFor(run, description))
        found.push(
          at(
            'T3004',
            one,
            node,
            `it calls the flow \`${name}\` and waits for it. That flow has full access, and the route states no \`system\`, so the call fails while it runs.`,
            "State `system: 'why'` on the route, state `as: 'starter'` on the flow, or start the flow with `start`, which does not wait.",
          ),
        )
    }
    return found
  },
}
