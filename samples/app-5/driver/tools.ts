// The app's own tools of an agent, read from the description of the running version, each with its JSON Schema.
import type { BridgeTool } from './bridge.ts'

type Stored = Record<string, unknown>

const record = (value: unknown): Stored => (value && typeof value === 'object' ? Object(value) : {})

// A type of the description, `{ kind: 'text', max: 200 }`, as JSON Schema.
export const schemaOf = (type: unknown): object => {
  const t = record(type)
  const about = typeof t.about === 'string' ? { description: t.about } : {}
  switch (t.kind) {
    case 'text':
    case 'link':
    case 'file':
      return { type: 'string', ...about }
    case 'date':
      return { type: 'string', format: 'date-time', ...about }
    case 'day':
      return { type: 'string', format: 'date', ...about }
    case 'number':
      return { type: t.whole ? 'integer' : 'number', ...about }
    case 'boolean':
      return { type: 'boolean', ...about }
    case 'choice':
      return { type: 'string', enum: Array.isArray(t.of) ? t.of : Array.isArray(t.values) ? t.values : [], ...about }
    case 'list':
      return { type: 'array', items: schemaOf(t.of), ...about }
    case 'object':
      return fieldsSchema(t.shape)
    default:
      return { ...about }
  }
}

export const fieldsSchema = (fields: unknown): object => {
  const properties: Record<string, object> = {}
  const required: string[] = []
  for (const [name, type] of Object.entries(record(fields))) {
    properties[name] = schemaOf(type)
    const t = record(type)
    if (!t.optional && t.default === undefined) required.push(name)
  }
  return { type: 'object', properties, required }
}

const reads = /^(read|search|find|get|list|look)/i

export interface AppTool extends BridgeTool {
  // Whether the tool may run with no Yes of the person: it only reads, and its definition asks nobody.
  free: boolean
}

export const appToolsOf = (
  stored: object,
  agentName: string,
  call: (name: string, input: unknown) => Promise<unknown>,
): AppTool[] => {
  const description = record(stored)
  const agent = record(record(record(description.flows)[agentName]).agent)
  const names = Array.isArray(agent.tools) ? agent.tools.map(String) : []
  const tools: AppTool[] = []
  for (const name of names) {
    const service = record(record(description.services)[name])
    if (service.mcp) {
      for (const [callName, entry] of Object.entries(record(service.calls))) {
        const one = record(entry)
        tools.push({
          name: `${name}_${callName}`,
          about: String(one.about ?? callName),
          schema: record(one.schema),
          free: reads.test(callName),
          call: (input) => call(`${name}.${callName}`, input),
        })
      }
      continue
    }
    const stored = record(record(description.functions)[name] ?? record(description.flows)[name])
    tools.push({
      name,
      about: String(stored.about ?? name),
      schema: fieldsSchema(stored.input),
      free: stored.danger !== 'ask' && stored.kind === 'query',
      call: (input) => call(name, input),
    })
  }
  return tools
}
