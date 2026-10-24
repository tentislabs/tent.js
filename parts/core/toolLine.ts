import { isStored } from './record.ts'
import { answerOf } from './answerOf.ts'
import { fromJsonSchema } from './fromJsonSchema.ts'
import type { Description } from './description.ts'
import { wordsOf } from './engineWords.ts'
import { sendsOut } from './sendsOut.ts'
import type { ToolSpec } from './shared.ts'
import type { Type } from './type.ts'
import { typeText } from './typeText.ts'

/** What a line is told of a run: whether it stands under a tool call that agreed to nothing, the tools of sources, the outside tools held back. */
export interface LineTold {
  called?: boolean
  specs?: ToolSpec[]
  held?: string[]
}

/** One tool as an agent lists it: the definition, the name a model is told it under, and what the entry says. */
export interface ToolEntry {
  tool: string
  told: string
  about?: string
  line?: false
  tries?: number
}

/** The record of an agent in a description, or nothing for a name that is none. */
export function agentRecord(description: Description, agent: string): Record<string, unknown> | undefined {
  const flow = Object.hasOwn(description.flows, agent) ? description.flows[agent] : undefined
  return isStored(flow?.agent) ? flow.agent : undefined
}

/** The approved tools of an outside server, by their names, as its `calls` hold them. */
function outsideCalls(description: Description, service: string): Record<string, unknown> {
  const stored = Object.hasOwn(description.services, service) ? description.services[service] : undefined
  return stored?.mcp && isStored(stored.calls) ? stored.calls : {}
}

/**
 * The tools of an agent, each as its entry says, in the order it lists them. An entry that names an outside
 * server whole stands for each of its approved tools, under `<service>.<tool>`, in the order of their names.
 */
export function entriesOf(description: Description, agent: string): ToolEntry[] {
  const tools = agentRecord(description, agent)?.tools
  return (Array.isArray(tools) ? tools : []).flatMap((entry): ToolEntry[] => {
    const tool = isStored(entry) ? String(entry.tool) : String(entry)
    const own = {
      ...(isStored(entry) && typeof entry.about === 'string' ? { about: entry.about } : {}),
      ...(isStored(entry) && entry.line === false ? { line: false as const } : {}),
      ...(isStored(entry) && typeof entry.tries === 'number' ? { tries: entry.tries } : {}),
    }
    if (!tool.includes('.') && Object.hasOwn(description.services, tool) && description.services[tool]?.mcp)
      return Object.keys(outsideCalls(description, tool))
        .sort()
        .map((call) => ({ tool: `${tool}.${call}`, told: `${tool}.${call}`, ...own }))
    return [{ tool, told: isStored(entry) && typeof entry.name === 'string' ? entry.name : tool, ...own }]
  })
}

/** The record of a definition that is a tool: a function, a flow, a model that is a function, or a tool of an outside server. */
export const toolRecord = (description: Description, tool: string): Record<string, unknown> | undefined =>
  tool.includes('.') && !Object.hasOwn(description.functions, tool)
    ? outsideRecord(description, tool)
    : Object.hasOwn(description.functions, tool)
      ? description.functions[tool]
      : Object.hasOwn(description.flows, tool)
        ? description.flows[tool]
        : Object.hasOwn(description.models, tool) && description.models[tool].input !== undefined
          ? description.models[tool]
          : undefined

/** The approved tool of an outside server that `<service>.<tool>` names, with its input as the types of its schema. */
function outsideRecord(description: Description, name: string): Record<string, unknown> | undefined {
  const [service, tool] = name.split('.')
  const call: unknown = tool === undefined ? undefined : outsideCalls(description, service)[tool]
  if (!isStored(call)) return undefined
  const input = fromJsonSchema(call.schema)
  return { ...call, ...(input.kind === 'object' ? { input: input.shape } : {}) }
}

/** A row type with its id told as an id of its table, at any depth of a list or of nothing. */
function rowsOf(type: Type, table: string): Type {
  if (type.kind === 'list') return { ...type, of: rowsOf(type.of, table) }
  if (type.kind === 'object' && type.shape.id?.kind === 'text')
    return { ...type, shape: { ...type.shape, id: { kind: 'link', table } } }
  if (type.kind === 'object' && isStored(type.shape.rows) && type.shape.rows.kind === 'list')
    return { ...type, shape: { ...type.shape, rows: rowsOf(type.shape.rows, table) } }
  return type
}

/** What a tool answers, as its line tells it: the rows of a query over a table carry their ids as ids of it. */
export function givenOf(description: Description, tool: string): Type | undefined {
  const type = answerOf(description, tool)
  const plan = toolRecord(description, tool)?.plan
  const table = isStored(plan) && typeof plan.from === 'string' ? plan.from : undefined
  return type && table ? rowsOf(type, table) : type
}

/** Whether a type holds an id of a table, at any depth. */
function holdsIds(type: unknown, table: string): boolean {
  if (!isStored(type)) return false
  if (type.kind === 'link') return type.table === table
  if (type.kind === 'list') return holdsIds(type.of, table)
  if (type.kind === 'object')
    return Object.values(isStored(type.shape) ? type.shape : {}).some((one) => holdsIds(one, table))
  return false
}

/** Tables named in a list, in the order the description stores the tables, with a comma and a space between. */
function tablesText(description: Description, names: unknown): string {
  const named = new Set(Array.isArray(names) ? names.map(String) : [])
  return Object.keys(description.tables)
    .filter((one) => named.has(one))
    .join(', ')
}

/**
 * Whether a tool asks a person in this run: it states `danger: 'ask'`, or sends and is not trusted, or is trusted
 * in a called run. What it states is read from the tool the run hands for its name, where it hands one, and from
 * its definition otherwise.
 */
export function asksIn(description: Description, agent: string, entry: ToolEntry, o: LineTold): boolean {
  const spec = o.specs?.find((one) => one.name === entry.told)
  const trust = agentRecord(description, agent)?.trust
  // A tool of an outside server is trusted by its own name, or by its service.
  const service = !spec && entry.tool.includes('.') ? entry.tool.split('.')[0] : undefined
  const trusted =
    Array.isArray(trust) &&
    (trust.includes(entry.told) || trust.includes(entry.tool) || (service !== undefined && trust.includes(service)))
  const danger = spec ? spec.danger : toolRecord(description, entry.tool)?.danger
  const sends = spec ? spec.sends !== false : sendsOut(description, entry.tool)
  return danger === 'ask' || (sends && !trusted) || (trusted && o.called === true)
}

/** The input of a tool as a record of types: an agent takes its message, its files and its conversation. */
export function inputOf(description: Description, tool: string): Record<string, Type> {
  const flow = Object.hasOwn(description.flows, tool) ? description.flows[tool] : undefined
  if (isStored(flow?.agent)) {
    const memory = isStored(flow.agent.memory)
    return {
      message: { kind: 'text', lines: 'many' },
      files: { kind: 'list', of: { kind: 'file' }, optional: true },
      ...(memory ? { thread: { kind: 'text', optional: true } } : {}),
    }
  }
  const input = toolRecord(description, tool)?.input
  const found: Record<string, Type> = {}
  for (const [name, type] of Object.entries(isStored(input) ? input : {}))
    if (isStored(type) && typeof type.kind === 'string') found[name] = Object(type)
  return found
}

/**
 * Takes a description, an agent or none, the name a tool is told under, and what is known of the run. Answers
 * what the engine adds to the tool's sentence: `Gives <type>.` where its answer is known, `Takes <field> from
 * <tools>.` for each input field that links to a table whose ids other tools give, `Reads` and `Writes` the tables
 * its definition names, `Sends data out.`, that a call may join a run under way, and the words of an ask where it asks in this run, each only where it
 * stands. With no agent, for what MCP lists, no entry, no trust and no words are read, and no ask is written.
 */
export function toolLine(
  description: Description,
  agent: string | undefined,
  name: string,
  o: LineTold & { gives?: false } = {},
): string {
  const entries = agent ? entriesOf(description, agent) : []
  const entry = entries.find((one) => one.told === name) ?? { tool: name, told: name }
  const words = agent ? Object(agentRecord(description, agent)?.words) : {}
  const say = (word: Parameters<typeof wordsOf>[1], value?: string): string => wordsOf(words, word, value)
  const spec = o.specs?.find((one) => one.name === name)
  const asks = agent !== undefined && asksIn(description, agent, spec ? { tool: name, told: name } : entry, o)
  if (spec) return [...(spec.sends !== false ? [say('sends')] : []), ...(asks ? [say('asksFirst')] : [])].join(' ')
  if (entry.line === false) return asks ? say('asksFirst') : ''
  const record = toolRecord(description, entry.tool)
  const given = givenOf(description, entry.tool)
  const takes = entries.length
    ? Object.entries(inputOf(description, entry.tool)).flatMap(([field, type]) => {
        if (type.kind !== 'link') return []
        const from = entries
          .filter((one) => one.told !== entry.told && holdsIds(givenOf(description, one.tool), type.table))
          .map((one) => one.told)
        return from.length ? [`Takes ${field} from ${from.join(', ')}.`] : []
      })
    : []
  const reads = tablesText(description, record?.reads)
  const writes = tablesText(description, record?.touches)
  // A flow whose start joins the run of its key under way says so: a second call is answered the first run.
  const joins = isStored(record?.together) && record.together.then === 'join'
  return [
    ...(given && o.gives !== false ? [say('gives', typeText(given))] : []),
    ...takes,
    ...(reads ? [say('reads', reads)] : []),
    ...(writes ? [say('writes', writes)] : []),
    ...(sendsOut(description, entry.tool) ? [say('sends')] : []),
    ...(joins ? [say('joins')] : []),
    ...(asks ? [say('asksFirst')] : []),
  ].join(' ')
}
