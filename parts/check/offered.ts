import { isStored } from '../core/internal.ts'

/** Takes a stored definition. Answers whether it states that it is offered to MCP: `offer: ['mcp']`. */
export const isOfferedToMcp = (record: unknown): boolean =>
  isStored(record) && Array.isArray(record.offer) && record.offer.includes('mcp')
