import type { Finding } from '../../core/index.ts'
import type { Rule } from '../rule.ts'
import { at } from '../rule.ts'
import { agentsOf } from '../agents.ts'
import { reachedFrom, recordOf } from '../../core/internal.ts'

/**
 * A tool that `trust` names and that can be seen to reach a function that asks a person: a trusted call runs
 * under `trusted`, where a function that asks is refused, so the tool would be stopped in the middle of its work.
 */
export const rule: Rule = {
  code: 'T7017',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    for (const { written, record } of agentsOf(description, source)) {
      const trust = Array.isArray(record.trust) ? record.trust.map(String) : []
      for (const tool of trust) {
        const asking = [...reachedFrom(description, tool)].find((one) => recordOf(description, one)?.danger === 'ask')
        if (asking)
          found.push(
            at(
              'T7017',
              written,
              undefined,
              `\`trust\` names ${tool}, which reaches ${asking}, a function that asks a person: under trust it is refused.`,
              `Take ${tool} out of \`trust\`, so that the person is asked before it starts.`,
            ),
          )
      }
    }
    return found
  },
}
