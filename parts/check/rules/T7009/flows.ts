import type { Finding } from '../../../core/index.ts'
import type { Rule } from '../../rule.ts'
import { at, writtenIn } from '../../rule.ts'
import { isStored } from '../../../core/internal.ts'
import { statedAt } from '../../stated.ts'

/** The name of a tool as an agent lists it: its name, or the `tool` of its record. */
const toolName = (tool: unknown): string => (isStored(tool) ? String(tool.tool) : String(tool))

/**
 * A flow or an agent that others are told of, and that does not say what it is. A flow that the pages may
 * call needs `input`; one that is offered to an outside door also `about` and `output`, and its missing `access`
 * is told under the code of a door with no rule; a flow that is
 * a tool of an agent needs `about`, `input` and `output`, and an agent that is one needs `about`.
 */
export const rule: Rule = {
  code: 'T7009',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    // Every flow and agent that some agent lists among its tools.
    const tools = new Set<string>()
    for (const flow of Object.values(description.flows)) {
      const listed = isStored(flow.agent) && Array.isArray(flow.agent.tools) ? flow.agent.tools : []
      for (const tool of listed) tools.add(toolName(tool))
    }
    const found: Finding[] = []
    for (const one of writtenIn(source)) {
      const flow = Object.hasOwn(description.flows, one.name) ? description.flows[one.name] : undefined
      if (!flow || (one.word !== 'flow' && one.word !== 'agent')) continue
      const lacks = (what: string[], why: string, fix: string): void => {
        // The description leaves out `input: {}`, which the file still states.
        const missing = what.filter((option) => flow[option] === undefined && statedAt(one, [option]) === undefined)
        if (missing.length)
          found.push(
            at(
              'T7009',
              one,
              undefined,
              `${why}, and states no ${missing.map((option) => `\`${option}\``).join(', no ')}.`,
              fix,
            ),
          )
      }
      if (one.word === 'agent') {
        if (tools.has(one.name) || Array.isArray(flow.offer))
          lacks(
            ['about'],
            `the agent is ${tools.has(one.name) ? 'a tool of an agent' : 'offered'}`,
            'State `about`: one sentence on what the agent is for.',
          )
        continue
      }
      if (Array.isArray(flow.offer))
        lacks(
          ['about', 'input', 'output'],
          'the flow is offered to an outside door',
          'State what a caller there must know of it: `about`, `input` and `output`.',
        )
      else if (flow.access !== undefined)
        lacks(
          ['input'],
          'the flow is offered to the pages of the app',
          'State `input`: the fields that a call gives the flow, also where it takes none, as `input: {}`.',
        )
      if (tools.has(one.name))
        lacks(
          ['about', 'input', 'output'],
          'the flow is a tool of an agent',
          'State `about`, `input` and `output`: a model is told a tool by them.',
        )
    }
    return found
  },
}
