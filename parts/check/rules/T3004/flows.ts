import type { Finding } from '../../../core/index.ts'
import { waitedFor } from '../../fullAccess.ts'
import type { Rule } from '../../rule.ts'
import { arrowOf, at, writtenIn } from '../../rule.ts'

/**
 * Full access of a flow that nothing states. A flow that the pages or an outside door may call runs as its
 * starter, or says why not with `system`. And a flow that has full access is called and waited for only by a
 * function that states `system`: without it the call fails while it runs.
 */
export const rule: Rule = {
  code: 'T3004',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    for (const one of writtenIn(source)) {
      const flow = Object.hasOwn(description.flows, one.name) ? description.flows[one.name] : undefined
      if (one.word === 'flow' && flow && flow.access !== undefined) {
        if (flow.as !== 'starter' && flow.system === undefined)
          found.push(
            at(
              'T3004',
              one,
              undefined,
              'the flow is offered, and has full access with no reason stated: whoever passes its `access` would start work that passes every rule.',
              "State `as: 'starter'`, so that a run has the rights of its caller, or `system: 'why'` with the reason it has full access.",
            ),
          )
        continue
      }
      const fn = Object.hasOwn(description.functions, one.name) ? description.functions[one.name] : undefined
      if (fn?.kind !== 'action' || fn.system !== undefined) continue
      // The source holds the call whether or not the build read `run`.
      const run = arrowOf(one, 'run')
      for (const [name, node] of run ? waitedFor(run, description) : [])
        found.push(
          at(
            'T3004',
            one,
            node,
            `it calls the flow \`${name}\` and waits for it. That flow has full access, and the action states no \`system\`, so the call fails while it runs.`,
            "State `system: 'why'` on the action, state `as: 'starter'` on the flow, or start the flow with `start`, which does not wait.",
          ),
        )
    }
    return found
  },
}
