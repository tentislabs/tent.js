import type { Finding } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import { reachedFrom, recordOf, sendsOut, toolsOf, isStored } from '../../core/internal.ts'
import type { Rule } from '../rule.ts'
import { at } from '../rule.ts'
import { agentsOf } from '../agents.ts'

/** Whether what a definition writes sets off a flow that sends: a flow with a trigger on a table it touches. */
function setsOffSending(description: Description, name: string): boolean {
  const record = recordOf(description, name)
  const touches = Array.isArray(record?.touches) ? record.touches.map(String) : []
  return Object.entries(description.flows).some(
    ([flow, stored]) =>
      Array.isArray(stored.on) &&
      stored.on.some((trigger) => isStored(trigger) && touches.includes(String(trigger.table))) &&
      sendsOut(description, flow),
  )
}

/**
 * A tool that is neither asked about nor named in `trust`, and can be seen to reach a function that asks or to set
 * off a flow that sends: the person will be asked in the middle of its work. Also a tool that an agent names in
 * `trust`, where that agent is a tool of another: called that way, its `trust` does not hold. A warning.
 */
export const rule: Rule = {
  code: 'T7018',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    const agents = agentsOf(description, source)
    const called = new Set(agents.flatMap(({ record }) => toolsOf(record)))
    for (const { written, name, record } of agents) {
      const trust = Array.isArray(record.trust) ? record.trust.map(String) : []
      for (const tool of toolsOf(record)) {
        const stored = recordOf(description, tool)
        // A tool that asks before it starts, and one that the person may be asked about there, ask in time.
        const asks = stored?.danger === 'ask' || (sendsOut(description, tool) && !trust.includes(tool))
        if (asks || trust.includes(tool)) continue
        const reached = [...reachedFrom(description, tool)]
        const asking = reached.find((one) => recordOf(description, one)?.danger === 'ask')
        const setsOff = [tool, ...reached].find((one) => setsOffSending(description, one))
        if (asking || setsOff)
          found.push(
            at(
              'T7018',
              written,
              undefined,
              asking
                ? `the tool ${tool} reaches ${asking}, which asks a person: they will be asked in the middle of its work.`
                : `the tool ${tool} sets off a flow that sends: the person will be asked in the middle of its work.`,
              `State on ${tool} what it does - \`danger: 'ask'\`, or that it sends - so that the person is asked before it starts.`,
              'warning',
            ),
          )
      }
      if (trust.length && called.has(name))
        found.push(
          at(
            'T7018',
            written,
            undefined,
            'it names tools in `trust` and is a tool of another agent: called that way, its `trust` does not hold, and each of them asks.',
            'Leave `trust` to the agents that a person starts, or know that each of those tools asks when this one is called.',
            'warning',
          ),
        )
    }
    return found
  },
}
