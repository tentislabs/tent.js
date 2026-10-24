import type { Finding } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import { limitDefaults, recordOf, toolsOf, isStored } from '../../core/internal.ts'
import type { Rule } from '../rule.ts'
import { at } from '../rule.ts'
import { agentsOf } from '../agents.ts'

/** The flows and agents that are tools of one, which are runs of their own when called. */
const runToolsOf = (description: Description, name: string): string[] => {
  const record = recordOf(description, name)
  const agent = isStored(record?.agent) ? record.agent : undefined
  return agent ? toolsOf(agent).filter((tool) => Object.hasOwn(description.flows, tool)) : []
}

/**
 * Flows and agents as tools that stand deeper than `callDepth` below an agent, or lead back to it: the
 * deepest of them would be refused with T5105, and a way back calls itself for ever.
 */
export const rule: Rule = {
  code: 'T7008',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    const stated: unknown = Reflect.get(Object(description.project.limits), 'callDepth')
    const most = typeof stated === 'number' ? stated : (limitDefaults.project.callDepth ?? 3)
    for (const { written, name } of agentsOf(description, source)) {
      let deepest = 1
      let back = false
      // Each way down from the agent, as far as the tools that are runs reach.
      const walk = (from: string, depth: number, way: string[]): void => {
        deepest = Math.max(deepest, depth)
        if (depth > most + 1) return
        for (const tool of runToolsOf(description, from)) {
          if (tool === name) back = true
          else if (!way.includes(tool)) walk(tool, depth + 1, [...way, tool])
        }
      }
      walk(name, 1, [name])
      if (back)
        found.push(
          at(
            'T7008',
            written,
            undefined,
            'its tools lead back to itself: a run would call itself for ever.',
            'Take the agent out of the tools that lead back to it.',
          ),
        )
      else if (deepest > most)
        found.push(
          at(
            'T7008',
            written,
            undefined,
            `its tools that are runs stand ${deepest} deep, past \`callDepth\` of ${most}: the deepest would be refused.`,
            'Give the agent fewer levels of tools that are runs, or raise `callDepth` in `project.limits`.',
          ),
        )
    }
    return found
  },
}
