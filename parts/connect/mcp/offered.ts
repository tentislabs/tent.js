import type { Caller } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import { isStored } from '../../core/internal.ts'

/** One function, flow or agent that is offered to MCP: its own name, the name of its tool, and its record. */
export interface Offered {
  name: string
  tool: string
  kind: 'query' | 'change' | 'action' | 'flow' | 'agent'
  record: Record<string, unknown>
}

/** What the project states for MCP, as it is stored. */
export const mcpOf = (description: Description): Record<string, unknown> => Object(description.project.mcp)

/** The name of the tool of a function: its own, or what `mcp.names` of the project gives it. */
function toolNameOf(description: Description, name: string): string {
  const names = mcpOf(description).names
  const given = isStored(names) && Object.hasOwn(names, name) ? names[name] : undefined
  return typeof given === 'string' ? given : name
}

/** Whether a function only reads: a query, and an action or a `python` that states `changes: false`. */
export const onlyReads = (one: Offered): boolean =>
  one.kind === 'query' || (one.kind === 'action' && one.record.changes === false)

const kindOf = (record: Record<string, unknown>): Offered['kind'] | undefined =>
  record.kind === 'query' || record.kind === 'change' || record.kind === 'action' ? record.kind : undefined

/**
 * Every function, flow and agent that states `offer: ['mcp']` and that `mcp.only` does not leave out, in the
 * order of the names of their tools. These are what a caller finds by name; what a caller is listed is narrowed
 * further by `listedTo`.
 */
export function offeredToMcp(description: Description): Offered[] {
  const only = mcpOf(description).only
  const found: Offered[] = []
  const add = (name: string, record: Record<string, unknown>, kind: Offered['kind'] | undefined): void => {
    if (!kind || !Array.isArray(record.offer) || !record.offer.includes('mcp')) return
    const one: Offered = { name, tool: toolNameOf(description, name), kind, record }
    if (only === 'queries' && !onlyReads(one)) return
    if (Array.isArray(only) && !only.includes(name)) return
    found.push(one)
  }
  for (const [name, record] of Object.entries(description.functions)) add(name, record, kindOf(record))
  for (const [name, record] of Object.entries(description.flows))
    add(name, record, record.agent === undefined ? 'flow' : 'agent')
  return found.sort((a, b) => (a.tool < b.tool ? -1 : a.tool > b.tool ? 1 : 0))
}

/** The functions that a finer scope of `mcp.scopes` names. */
function scopeHolds(description: Description, scope: string, name: string): boolean {
  const scopes = mcpOf(description).scopes
  const named = isStored(scopes) ? scopes[scope] : undefined
  return Array.isArray(named) && named.includes(name)
}

/**
 * Whether what a caller was given covers an offered function. A token of a person: `write` covers every function,
 * `read` those that only read, and a finer scope the functions it names. A key: the functions its scopes name, or
 * every one with `'*'`. Any other caller is covered by nothing narrower than the function's own rule.
 */
export function covers(description: Description, caller: Caller, one: Offered): boolean {
  if (caller.kind === 'mcp' && caller.grant) {
    const { scopes } = caller.grant
    if (scopes.includes('write')) return true
    if (scopes.includes('read') && onlyReads(one)) return true
    return scopes.some((scope) => scopeHolds(description, scope, one.name))
  }
  if (caller.kind === 'key' && caller.key)
    return caller.key.scopes.includes('*') || caller.key.scopes.includes(one.name)
  return true
}

/** Whether a rule as it is stored is open to everyone. */
export const openToAnyone = (rule: unknown): boolean => isStored(rule) && rule.rule === 'anyone'

/**
 * What a caller is listed: what is offered, covered by what the caller was given, and for a caller who is nobody,
 * where the project lets one in, the functions whose rule is `anyone` alone.
 */
export function listedTo(description: Description, caller: Caller): Offered[] {
  return offeredToMcp(description).filter(
    (one) => covers(description, caller, one) && (caller.kind !== 'nobody' || openToAnyone(one.record.access)),
  )
}

/** Whether only a screen in a chat uses an offered function, as the build found: the frame alone calls it. */
export function forFrame(description: Description, one: Offered): boolean {
  const frame: unknown = Object(description.mcp).frame
  return Array.isArray(frame) && frame.includes(one.name)
}
