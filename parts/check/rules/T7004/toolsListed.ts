import type { Finding } from '../../../core/index.ts'
import { isOfferedToMcp } from '../../offered.ts'
import type { Rule } from '../../rule.ts'
import { at, writtenIn } from '../../rule.ts'
import { isStored } from '../../../core/internal.ts'

/**
 * More functions, flows and agents offered to MCP than `mcp.toolsListed` of the project, 20 where it states none:
 * a caller who would be listed them all is listed the pair of `findFunction` and `callFunction` in their place.
 * `mcp.only` narrows what counts. A warning, at the project.
 */
export const rule: Rule = {
  code: 'T7004',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const mcp = isStored(description.project.mcp) ? description.project.mcp : {}
    const listed = typeof mcp.toolsListed === 'number' ? mcp.toolsListed : 20
    const reads = (record: Record<string, unknown>): boolean =>
      record.kind === 'query' || (record.kind === 'action' && record.changes === false)
    const counted = [
      ...Object.entries(description.functions).filter(([, record]) => isOfferedToMcp(record)),
      ...Object.entries(description.flows).filter(([, record]) => isOfferedToMcp(record)),
    ].filter(
      ([name, record]) =>
        (mcp.only !== 'queries' || reads(record)) && (!Array.isArray(mcp.only) || mcp.only.includes(name)),
    )
    const written = writtenIn(source).find((one) => one.word === 'project')
    if (counted.length <= listed || !written) return []
    const found: Finding = at(
      'T7004',
      written,
      undefined,
      `${counted.length} functions, flows and agents are offered to MCP, above its toolsListed of ${listed}: a client that may see them all is listed findFunction and callFunction in their place.`,
      'Offer fewer functions to MCP, narrow them with `mcp.only`, or raise `mcp.toolsListed` of the project.',
      'warning',
    )
    return [found]
  },
}
