import type { Finding } from '../../core/index.ts'
import type { Rule } from '../rule.ts'
import { at, writtenIn } from '../rule.ts'
import { isStored } from '../../core/internal.ts'

/**
 * A flow or an agent that names a door in `offer` and states no `access`. Neither word requires `access`, so
 * the description cannot say it: a function, a route and a screen with none are told there, under T1008.
 */
export const rule: Rule = {
  code: 'T3001',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    for (const one of writtenIn(source)) {
      if (one.word !== 'flow' && one.word !== 'agent') continue
      const stored = Object.hasOwn(description.flows, one.name) ? description.flows[one.name] : undefined
      const doors = Array.isArray(stored?.offer) ? stored.offer.map(String) : []
      // The record of an agent keeps its rule among what is the agent's own.
      const access = stored?.access ?? (isStored(stored?.agent) ? stored.agent.access : undefined)
      if (!stored || doors.length === 0 || access !== undefined) continue
      found.push(
        at(
          'T3001',
          one,
          undefined,
          `the ${one.word} is offered to ${doors.map((door) => `'${door}'`).join(' and ')} and states no \`access\`: nothing says who may start it there.`,
          "State who may start it, `access: 'signedIn'` or `role(...)`, or take the door out of `offer`.",
        ),
      )
    }
    return found
  },
}
