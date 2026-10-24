import type { Finding } from '../../core/index.ts'
import type { Rule } from '../rule.ts'
import { at, writtenIn } from '../rule.ts'
import { agentsOf } from '../agents.ts'
import { toolsOf } from '../../core/internal.ts'

/**
 * A flow that is a tool of an agent and does not state `as: 'starter'`: an agent runs as its starter, and
 * a flow with full access is no tool it may call (T0013 while running).
 */
export const rule: Rule = {
  code: 'T7012',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const tools = new Set(agentsOf(description, source).flatMap(({ record }) => toolsOf(record)))
    const found: Finding[] = []
    for (const written of writtenIn(source)) {
      if (written.word !== 'flow' || !tools.has(written.name)) continue
      const flow = description.flows[written.name]
      if (!flow || flow.as === 'starter' || flow.agent !== undefined) continue
      found.push(
        at(
          'T7012',
          written,
          undefined,
          "it is a tool of an agent and does not state `as: 'starter'`: an agent may not call a flow with full access.",
          "State `as: 'starter'`; work that needs full access is an action that states `system`, which may call the flow.",
        ),
      )
    }
    return found
  },
}
