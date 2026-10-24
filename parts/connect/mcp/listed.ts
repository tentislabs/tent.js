import type { Type } from '../../core/index.ts'
import { object, text } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import { answerOf, isStored, toJsonSchema, toolLine, toolList } from '../../core/internal.ts'
import { isType } from '../callInput.ts'
import { withUploads } from './inline.ts'
import type { Marks } from './marks.ts'
import { marksOf, titleOf } from './marks.ts'
import type { Offered } from './offered.ts'
import { forFrame } from './offered.ts'

/** A tool as the list of the standard holds it. */
export interface Listed {
  name: string
  title: string
  description: string
  inputSchema: object
  outputSchema?: object
  annotations: Marks
  _meta?: object
}

/** The input of an offered function as one record type: its fields, and `{ message }` for an agent. */
function inputOf(one: Offered): Type {
  if (one.kind === 'agent') return object({ message: text() })
  const shape: Record<string, Type> = {}
  const input = isStored(one.record.input) ? one.record.input : {}
  for (const [field, type] of Object.entries(input)) if (isType(type)) shape[field] = type
  return object(shape)
}

/**
 * The form of what a tool answers, where it is known: the type itself for a record, and `{ value }` around any
 * other, as the answer is written. A `json` may be either, and has no form.
 */
function outputOf(description: Description, one: Offered): object | undefined {
  const answer = answerOf(description, one.name)
  if (!answer || answer.kind === 'json') return undefined
  return answer.kind === 'object' ? toJsonSchema(answer) : toJsonSchema(object({ value: answer }))
}

/**
 * The two lines of one offered function as the list of an agent writes them, under the name of its tool:
 * its input and its answer, then its `about` and the line the engine writes for it.
 */
export function twoLinesOf(description: Description, one: Offered): string {
  const { own } = toolList(description, [one.name])
  // The list names the function, and a caller calls it by the name of its tool, which `mcp.names` may change.
  return own.startsWith(`${one.name}(`) ? `${one.tool}${own.slice(one.name.length)}` : own
}

/**
 * The tool of one offered function: its name, its title, its `about` with the line the engine writes for it, its
 * input, its answer and its marks.
 */
export function listedOf(description: Description, one: Offered): Listed {
  const output = outputOf(description, one)
  const about = typeof one.record.about === 'string' ? one.record.about : ''
  return {
    name: one.tool,
    title: titleOf(one.tool),
    description: [about, toolLine(description, undefined, one.name)].filter(Boolean).join(' '),
    inputSchema: withUploads(toJsonSchema(inputOf(one)), isStored(one.record.input) ? one.record.input : {}),
    ...(output ? { outputSchema: output } : {}),
    annotations: marksOf(description, one),
    // The extension's word that the frame alone calls the tool, which keeps it from the chat app's model.
    ...(forFrame(description, one) ? { _meta: { ui: { visibility: ['app'] } } } : {}),
  }
}
