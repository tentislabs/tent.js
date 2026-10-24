import { isStored } from '../../core/internal.ts'
import type { McpEnv } from './env.ts'
import { titleOf } from './marks.ts'
import type { Offered } from './offered.ts'
import { methods, moreNeeded } from './standard.ts'

/** An input as a person reads it: a line for each field with its value, and a field marked `secret` as `[secret]`. */
export function inputLines(fields: unknown, input: unknown): string[] {
  const types = isStored(fields) ? fields : {}
  return Object.entries(isStored(input) ? input : {}).map(([field, value]) => {
    const secret = Reflect.get(Object(types[field]), 'secret') === true
    return `${field}: ${secret ? '[secret]' : typeof value === 'string' ? value : JSON.stringify(value)}`
  })
}

/**
 * The question that a client puts to its person before a function that asks: the title of the tool, in the
 * words `tent.ask.title` of the project's texts, and its input, with a field marked `secret` as `[secret]`.
 */
export function questionOf(env: McpEnv, one: Offered, input: unknown, listed?: Record<string, string>): string {
  const title = titleOf(one.tool)
  const asked = env.word?.('tent.ask.title', { tool: title }) ?? `Run ${title}?`
  return [asked, ...inputLines(one.record.input, input), ...listedLines(env, listed)].join('\n')
}

/**
 * The calls that the ask of a sequence lists, as a person reads them: each with the title of its tool and its
 * input, a tool of an outside server by the name after its dot, and a last line where more will follow.
 */
function listedLines(env: McpEnv, listed: Record<string, string> | undefined): string[] {
  let sequence: unknown
  try {
    sequence = JSON.parse(listed?.sequence ?? 'null')
  } catch {
    return []
  }
  if (!Array.isArray(sequence)) return []
  const lines = sequence.map((one) => {
    const tool = String(Reflect.get(Object(one), 'tool'))
    const input = inputLines({}, Reflect.get(Object(one), 'input')).join(', ')
    return `- ${titleOf(tool.split('.').at(-1) ?? tool)}${input ? `: ${input}` : ''}`
  })
  const more = listed?.more === 'true'
  return [...lines, ...(more ? [env.word?.('tent.ask.more', {}) ?? 'More may be asked after these.'] : [])]
}

/** The standard's question with yes and no, as a request to a client. */
export const questionRequest = (message: string): { method: string; params: object } => ({
  method: methods.question,
  params: { message, requestedSchema: { type: 'object', properties: {} } },
})

/** The answer of a call that needs more of the client: the question, and the door's text that the call comes back with. */
export const moreIsNeeded = (message: string, text: string): Record<string, unknown> => ({
  resultType: moreNeeded,
  inputRequests: { ask: questionRequest(message) },
  requestState: text,
})
