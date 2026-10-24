import type { Finding } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import {
  reachedFrom,
  recordOf,
  tableRuleOf,
  sendsOut,
  tablesOf,
  takesOutside,
  toolsOf,
  isStored,
} from '../../core/internal.ts'
import type { Rule } from '../rule.ts'
import { at } from '../rule.ts'
import { agentsOf } from '../agents.ts'

/** Whether a tool reads what is not open to everyone. */
function readsClosed(description: Description, name: string): boolean {
  const record = recordOf(description, name)
  if (!record) return false
  if (record.form === 'code') return true
  if (isStored(record.agent)) return toolsOf(record.agent).some((tool) => readsClosed(description, tool))
  return tablesOf(record).some((table) => {
    const stored = Object.hasOwn(description.tables, table) ? description.tables[table] : undefined
    const read = tableRuleOf(stored, 'read')
    return stored !== undefined && Reflect.get(Object(read), 'rule') !== 'anyone'
  })
}

/**
 * An agent that has all three marks, counted over its tools and everything they can be seen to reach: one
 * reads what is not open to everyone, one takes in text from outside, and one sends data out with nobody asked,
 * because `trust` names it. A warning: the marks are a help, not a proof.
 */
export const rule: Rule = {
  code: 'T7002',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    for (const { written, record } of agentsOf(description, source)) {
      const tools = toolsOf(record)
      const reached = new Set(tools.flatMap((tool) => [tool, ...reachedFrom(description, tool)]))
      const trust = Array.isArray(record.trust) ? record.trust.map(String) : []
      const reads = [...reached].some((one) => readsClosed(description, one))
      const takes = [...reached].some((one) => takesOutside(description, one))
      const sends = tools.some((tool) => trust.includes(tool) && sendsOut(description, tool))
      if (reads && takes && sends)
        found.push(
          at(
            'T7002',
            written,
            undefined,
            'it can read what is not open to everyone, take in text from outside, and send data out with nobody asked: text written to steer the model could carry the data away.',
            'Take the sending tool out of `trust`, so that a person is asked before it runs.',
            'warning',
          ),
        )
    }
    return found
  },
}
