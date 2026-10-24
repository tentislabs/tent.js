import type { Description } from '../../core/internal.ts'

const offered = (record: Record<string, unknown>): boolean =>
  Array.isArray(record.offer) && record.offer.includes('mcp')

/** Whether an app offers something to MCP: a function, a flow, an agent or a screen that states it. */
export const offersToMcp = (description: Description): boolean =>
  [description.functions, description.flows, description.screens].some((all) => Object.values(all).some(offered))
