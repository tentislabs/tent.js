import { isStored } from './record.ts'
import type { Description } from './description.ts'

/** The names of the tools of an agent: each entry by its definition, also where it is written as a record. */
export const toolsOf = (record: Record<string, unknown>): string[] =>
  (Array.isArray(record.tools) ? record.tools : []).map((entry) =>
    isStored(entry) ? String(entry.tool) : String(entry),
  )

/** What one stored body calls, by the kind of what it reaches and its name, with the member of a model. */
export interface Reached {
  kind: 'function' | 'flow' | 'model' | 'service' | 'builtin'
  name: string
  member?: string
  args: unknown[]
}

/** Every call that a stored body holds, at every depth, with what it is handed. */
export function callsIn(node: unknown, found: Reached[] = []): Reached[] {
  if (Array.isArray(node)) {
    for (const one of node) callsIn(one, found)
    return found
  }
  if (!isStored(node)) return found
  const call = isStored(node.call) ? node.call : undefined
  const args = Array.isArray(node.args) ? node.args : []
  if (call) {
    for (const kind of ['function', 'flow', 'model'] as const) {
      if (typeof call[kind] !== 'string') continue
      // A call of a model names what it asks of it in `call`: `writer.fill` is `{ model: 'writer', call: 'fill' }`.
      const member = kind === 'model' && typeof call.call === 'string' ? call.call : call.member
      found.push({ kind, name: String(call[kind]), ...(typeof member === 'string' ? { member } : {}), args })
    }
    if (typeof call.service === 'string')
      found.push({ kind: 'service', name: `${String(call.service)}.${String(call.call)}`, args })
    if (typeof call.builtin === 'string') found.push({ kind: 'builtin', name: call.builtin, args })
  }
  // A flow that a body starts is reached too.
  if (node.fn === 'start' && isStored(args[0]) && typeof args[0].flow === 'string')
    found.push({ kind: 'flow', name: args[0].flow, args: args.slice(1) })
  for (const value of Object.values(node)) callsIn(value, found)
  return found
}

/** The stored record of a function or a flow by its name, where the description holds one. */
export function recordOf(description: Description, name: string): Record<string, unknown> | undefined {
  if (Object.hasOwn(description.functions, name)) return description.functions[name]
  if (Object.hasOwn(description.flows, name)) return description.flows[name]
  return undefined
}

/**
 * The functions and flows that a definition can be seen to reach: through the calls of its stored body, at every
 * depth, and through the tools of an agent. A definition that is code reaches what the check cannot see.
 */
export function reachedFrom(description: Description, name: string): Set<string> {
  const seen = new Set<string>()
  const left = [name]
  for (let at = left.pop(); at !== undefined; at = left.pop()) {
    if (seen.has(at)) continue
    seen.add(at)
    const record = recordOf(description, at)
    if (!record) continue
    const agent = isStored(record.agent) ? record.agent : undefined
    if (agent) left.push(...toolsOf(agent))
    for (const call of callsIn([record.body, record.writes, record.onFail]))
      if (call.kind === 'function' || call.kind === 'flow') left.push(call.name)
  }
  seen.delete(name)
  return seen
}

/** The tables that a stored record reads or writes, by its plan, its writes and its body. */
export function tablesOf(record: Record<string, unknown>): string[] {
  const found = new Set<string>()
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return void node.forEach(walk)
    if (!isStored(node)) return
    // A plan names its table in `from`, a body in `db`, and a write in `add`, `change` or `remove`.
    for (const key of ['from', 'db', 'add', 'change', 'remove'])
      if (typeof node[key] === 'string') found.add(String(node[key]))
    for (const value of Object.values(node)) walk(value)
  }
  walk([record.plan, record.writes, record.body, record.reads, record.touches])
  for (const name of Array.isArray(record.reads) ? record.reads : []) found.add(String(name))
  return [...found]
}
