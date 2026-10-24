import type { Finding } from '../../../core/index.ts'
import type { Rule } from '../../rule.ts'
import { at, writtenIn } from '../../rule.ts'

/**
 * A function or a screen that is offered to MCP and states no `about`: its tool is described to a chat app by
 * that sentence. A flow and an agent are held by the case of flows.
 */
export const rule: Rule = {
  code: 'T7009',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    for (const one of writtenIn(source)) {
      const record = Object.hasOwn(description.functions, one.name)
        ? description.functions[one.name]
        : Object.hasOwn(description.screens, one.name)
          ? description.screens[one.name]
          : undefined
      if (!record || !Array.isArray(record.offer) || !record.offer.includes('mcp') || record.about !== undefined)
        continue
      found.push(
        at(
          'T7009',
          one,
          undefined,
          'it is offered to MCP and states no `about`.',
          'State `about`: one sentence on what it is for, which a chat app is told as the description of its tool.',
        ),
      )
    }
    return found
  },
}
