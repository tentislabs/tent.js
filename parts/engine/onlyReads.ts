import type { Description } from '../core/internal.ts'
import type { Opened } from './opened.ts'
import { valuesOf } from './values/ofApp.ts'
import { isStored } from '../core/internal.ts'

/** Whether a function is a tool of an agent: its work is the writer's, as a step of the agent's run. */
function isTool(description: Description, name: string): boolean {
  return Object.values(description.flows).some(
    (flow) =>
      Array.isArray(flow.tools) && flow.tools.some((tool) => tool === name || (isStored(tool) && tool.tool === name)),
  )
}

/** The names of the secrets that the services and the models of a description name. */
function secretsNamed(description: Description): string[] {
  const found = new Set<string>()
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) for (const one of value) walk(one)
    else if (isStored(value)) {
      if (typeof value.secret === 'string') found.add(value.secret)
      for (const one of Object.values(value)) walk(one)
    }
  }
  walk(description.services)
  walk(description.models)
  return [...found]
}

/**
 * Whether a function is carried out as a call that only reads: a query, or an action that states
 * `changes: false`, which writes nothing in the store, starts no run and emits nothing.
 */
export function callReadsOnly(description: Description, name: string): boolean {
  const record = Object.hasOwn(description.functions, name) ? description.functions[name] : undefined
  return record?.kind === 'query' || (record?.kind === 'action' && record.changes === false)
}

/**
 * Whether a reader carries a call out itself, in place of handing it to the writer: one that only reads, but an
 * action that is a tool of an agent, or that states `worker`, `background`, `batch` or `remember`, which is the
 * writer's all the same; and an action that states `changes: false` only where the reader holds a value for every
 * secret that a service and a model of the running version name.
 */
export function readerCarries(o: Opened, name: string): boolean {
  const { description } = o
  if (!callReadsOnly(description, name)) return false
  const record = description.functions[name]
  if (record?.kind === 'query') return true
  if (!record || isTool(description, name)) return false
  if (['worker', 'background', 'batch', 'remember'].some((word) => record[word] !== undefined)) return false
  const held = new Set(valuesOf(o).secrets.names())
  return secretsNamed(description).every((secret) => held.has(secret))
}
