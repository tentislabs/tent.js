import { fingerprintOf, isStored } from '../../core/internal.ts'
import type { OutsideTool } from './env.ts'

/** A value as JSON with the keys of every record in order, so that one value is one text on every system. */
function ordered(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(ordered).join(',')}]`
  if (!isStored(value)) return JSON.stringify(value) ?? 'null'
  const keys = Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${keys.map((key) => `${JSON.stringify(key)}:${ordered(value[key])}`).join(',')}}`
}

/**
 * The fingerprint of a tool of an outside server: taken over its description and its input, written with the keys
 * in order. A tool whose fingerprint is not the one its approval wrote is not as it was approved.
 */
export const toolPrint = (tool: OutsideTool): string =>
  fingerprintOf(new TextEncoder().encode(ordered({ about: tool.about, schema: tool.schema })))

/** A tool as `mcp.lock.json` holds it: its description, its input and its fingerprint. */
export const lockedTool = (tool: OutsideTool): { about: string; schema: object; fingerprint: string } => ({
  about: tool.about,
  schema: tool.schema,
  fingerprint: toolPrint(tool),
})
