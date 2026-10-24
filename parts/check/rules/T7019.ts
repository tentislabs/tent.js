import type { Finding } from '../../core/index.ts'
import type { Rule } from '../rule.ts'
import { at } from '../rule.ts'
import { agentsOf } from '../agents.ts'
import { recordOf, toolsOf, isStored } from '../../core/internal.ts'

/** Whether a stored type is `json`, or holds one at any depth. */
function holdsJson(type: unknown): boolean {
  if (Array.isArray(type)) return type.some(holdsJson)
  if (!isStored(type)) return false
  if (type.kind === 'json') return true
  return Object.values(type).some(holdsJson)
}

/** A tool whose `output` is or holds `json`: what the model is given of it cannot be held to a type. A warning. */
export const rule: Rule = {
  code: 'T7019',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    for (const { written, record } of agentsOf(description, source))
      for (const tool of toolsOf(record))
        if (holdsJson(recordOf(description, tool)?.output))
          found.push(
            at(
              'T7019',
              written,
              undefined,
              `the output of its tool ${tool} holds \`json\`: what the model is given of it is held to no type.`,
              'Give the tool an output of fields that are typed, so that its answer is filtered before the model reads it.',
              'warning',
            ),
          )
    return found
  },
}
