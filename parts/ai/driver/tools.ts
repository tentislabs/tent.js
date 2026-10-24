import type { Type } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import type { Description, ToolSpec } from '../../core/internal.ts'
import { codes, fromJsonSchema, isStored, sendsOut, toJsonSchema, toolLine } from '../../core/internal.ts'
import type { ToolEntry } from '../../core/internal.ts'
import type { AgentOf } from './agentOf.ts'
import { wordsOf } from '../../core/internal.ts'
import { isType } from '../isType.ts'

/** One tool as it is offered in a run: its entry, its kind, its input as a type, whether it asks and whether it sends. */
export interface Offered {
  entry: ToolEntry
  kind: 'function' | 'flow' | 'agent' | 'source' | 'outside'
  input: Type
  about: string
  asks: boolean
  sends: boolean
  // The input of a tool of an outside server, as the schema its approval wrote.
  schema?: object
}

/** How often the step of a tool is tried: as its entry says, once where it says nothing, with no wait between the tries. */
export const toolTries = (tool: Offered): { max: number; wait: number } => ({ max: tool.entry.tries ?? 1, wait: 0 })

/**
 * The tools of an outside server that an entry names: each approved tool of the service it names whole, or the one
 * tool it names by `<service>.<tool>`, under that dotted name, but those that are held back.
 */
function outsideOf(
  description: Description,
  entry: ToolEntry,
  held: string[],
): { entry: ToolEntry; call: Record<string, unknown> }[] {
  const [service, one] = entry.tool.split('.')
  const stored = Object.hasOwn(description.services, service) ? description.services[service] : undefined
  if (!stored?.mcp) return []
  const calls = isStored(stored.calls) ? stored.calls : {}
  return Object.keys(calls)
    .filter((tool) => (one === undefined || tool === one) && !held.includes(`${service}.${tool}`))
    .sort()
    .flatMap((tool) => {
      const call = calls[tool]
      if (!isStored(call) || call.schema === undefined) return []
      const name = `${service}.${tool}`
      return [{ entry: { ...entry, tool: name, told: one === undefined ? name : entry.told }, call }]
    })
}

/** The input fields of a record as one object type. */
function objectOf(fields: unknown): Type {
  const shape: Record<string, Type> = {}
  for (const [name, type] of Object.entries(isStored(fields) ? fields : {})) if (isType(type)) shape[name] = type
  return { kind: 'object', shape }
}

/**
 * Takes a description, an agent, and whether its run stands under a tool call whose `leave` is `none`, as when
 * another agent called it. Answers each tool it offers: a function, a flow, or an agent, with its input, its
 * sentence, whether it asks a person before it runs, and whether it sends data out.
 */
export function offeredTools(
  description: Description,
  agent: AgentOf,
  called: boolean,
  held: string[] = [],
): Offered[] {
  const offered: Offered[] = []
  for (const entry of agent.tools) {
    // A tool of an outside server sends, so it asks unless `trust` names it or its service.
    for (const one of outsideOf(description, entry, held)) {
      const trusted = [one.entry.told, one.entry.tool, entry.tool.split('.')[0]].some((name) =>
        agent.trust.includes(name),
      )
      const asks = !trusted || called
      const sentence = entry.about ?? String(one.call.about ?? '')
      // Its line says that it sends, and that a person is asked where one is: the same as the list writes it.
      const line = toolLine(description, agent.name, one.entry.told, { called })
      offered.push({
        entry: one.entry,
        kind: 'outside',
        input: fromJsonSchema(one.call.schema),
        schema: isStored(one.call.schema) ? one.call.schema : { type: 'object' },
        about: [sentence, line].filter(Boolean).join(' '),
        asks,
        sends: true,
      })
    }
    const fn = Object.hasOwn(description.functions, entry.tool) ? description.functions[entry.tool] : undefined
    const flow = Object.hasOwn(description.flows, entry.tool) ? description.flows[entry.tool] : undefined
    // A model of any kind that states what it takes and gives is a tool too, called as a function.
    const model =
      Object.hasOwn(description.models, entry.tool) && description.models[entry.tool].input !== undefined
        ? description.models[entry.tool]
        : undefined
    const record = fn ?? flow ?? model
    if (!record) continue
    const isAgent = flow !== undefined && flow.agent !== undefined
    const memory = isAgent && isStored(Reflect.get(Object(flow.agent), 'memory'))
    const input: Type = isAgent
      ? {
          kind: 'object',
          shape: {
            message: { kind: 'text', lines: 'many' },
            files: { kind: 'list', of: { kind: 'file' }, optional: true },
            ...(memory ? { thread: { kind: 'text', optional: true } } : {}),
          },
        }
      : objectOf(record.input)
    const sends = sendsOut(description, entry.tool)
    const trusted = agent.trust.includes(entry.told) || agent.trust.includes(entry.tool)
    const asks = record.danger === 'ask' || (sends && !trusted) || (trusted && called)
    const sentence = entry.about ?? (typeof record.about === 'string' ? record.about : '')
    // The line says what the tool gives, takes, reads and writes, that it sends, and that a person is asked.
    const line = toolLine(description, agent.name, entry.told, { called })
    offered.push({
      entry,
      kind: fn || model ? 'function' : isAgent ? 'agent' : 'flow',
      input,
      about: [sentence, line].filter(Boolean).join(' '),
      asks,
      sends,
    })
  }
  return offered
}

/** The tools of a request, each with its sentence and its input as JSON Schema. */
export const requestTools = (offered: Offered[]): { name: string; about: string; input: object }[] =>
  offered.map((one) => ({ name: one.entry.told, about: one.about, input: one.schema ?? toJsonSchema(one.input) }))

/** The words of a code as they reach a model, with the engine's own words where it has some. */
const toldWords: Record<string, string> = { T3101: 'not allowed', T0001: 'no such tool' }

/**
 * Takes what a tool failed with. Answers what the model is told of it, in the words a caller would be sent: an
 * error of a code with a status, and an app's own `fail`, as `Error <code>: <message>`, and any other as T0009.
 */
export function errorText(error: unknown, words: Record<string, string>): string {
  const code: unknown = Reflect.get(Object(error), 'code')
  if (code === 'T5102') return wordsOf(words, 'tooLarge')
  if (code === 'T7111') return wordsOf(words, 'refused')
  // What went wrong inside may hold a secret: the model is told its reference alone.
  if (code === 'T0009') return refOf(error)
  if (typeof code === 'string' && Object.hasOwn(toldWords, code)) return `Error ${code}: ${toldWords[code]}`
  const row = typeof code === 'string' && Object.hasOwn(codes, code) ? Reflect.get(codes, code) : undefined
  const own = typeof code === 'string' && /^[a-z][a-z0-9-]*$/.test(code)
  if (error instanceof TentError && (own || (row && Reflect.get(row, 'status') !== undefined)))
    return `Error ${code}: ${error.message}`
  return refOf(error)
}

/** T0009 as a model is told it: the general sentence, with the reference of the error where it has one. */
function refOf(error: unknown): string {
  const ref: unknown = Reflect.get(Object(error), 'ref')
  return `Error T0009: Something went wrong.${typeof ref === 'string' ? ` Reference ${ref}.` : ''}`
}

/**
 * A tool of an outside server as a sequence knows it: its told name, its sentence, a field for each property of
 * the schema its approval wrote, of a type of which nothing is said, and whether it asks, as `sends`.
 */
export function outsideSpec(tool: Offered): ToolSpec {
  const properties: unknown = Reflect.get(Object(tool.schema), 'properties')
  const names = isStored(properties) ? Object.keys(properties) : []
  return {
    name: tool.entry.told,
    about: tool.about,
    input: Object.fromEntries(names.map((name) => [name, { kind: 'json', optional: true }])),
    sends: tool.asks,
  }
}
