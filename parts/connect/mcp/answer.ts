import type { WireError } from '../../core/index.ts'
import { isStored } from '../../core/internal.ts'

/** The answer of a tool, as the standard writes it. */
export interface ToolAnswer {
  content: ({ type: 'text'; text: string } | { type: 'image' | 'audio'; data: string; mimeType: string })[]
  structuredContent?: Record<string, unknown>
  isError?: true
  _meta?: Record<string, unknown>
}

/** A value as plain JSON: a moment as text in the standard form, and nothing left where it is undefined. */
const plain = (value: unknown): unknown => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)))

/**
 * The answer of a tool that worked: the value as the standard's typed answer, with the same as JSON text beside
 * it. A value that is no record is `{ value }` and nothing is `{}`, and the part that is kept from the model says
 * so, as `tent.wrapped`, so that a reader can tell it from a record with a field of that name.
 */
export function answered(value: unknown): ToolAnswer {
  const sent = plain(value)
  const record = isStored(sent) ? sent : undefined
  const structured = record ?? (sent === undefined ? {} : { value: sent })
  return {
    content: [{ type: 'text', text: JSON.stringify(structured) }],
    structuredContent: structured,
    ...(record ? {} : { _meta: { 'tent.wrapped': true } }),
  }
}

/**
 * The answer of a tool that failed: marked as an error, with the wire error under `tent.error` in the part that is
 * kept from the model and held to no form, and `Error <code>: <message>` as text, with a line for the fix and one
 * for each field: a chat app gives its model the text alone, so all it may mend by is there.
 */
export function failed(error: WireError, more: Record<string, unknown> = {}): ToolAnswer {
  const fields = Object.entries(error.fields ?? {}).map(([field, why]) => `\n${field}: ${why}`)
  const fix = typeof error.fix === 'string' && error.fix !== '' ? `\nFix: ${error.fix}` : ''
  return {
    content: [{ type: 'text', text: `Error ${error.code}: ${error.message}${fix}${fields.join('')}` }],
    isError: true,
    _meta: { 'tent.error': error, ...more },
  }
}
