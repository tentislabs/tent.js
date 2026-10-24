import type { Caller } from '../../core/index.ts'
import { asksNobody } from '../keys/caller.ts'
import { keyAt } from '../keys/kept.ts'
import type { Opened } from '../opened.ts'

/** The host of a client's id, where the id is the address of its document; nothing for any other id. */
function hostOf(id: string): string | undefined {
  try {
    return new URL(id).host
  } catch {
    return undefined
  }
}

/**
 * Whether the engine asks a person before a function that states `danger: 'ask'` runs, for a caller at `/mcp`.
 * It asks every caller, but where `mcp.asks` is the builder's word that the client's own asking is trusted: for
 * every client with `'client'`, or for one that a list names by the host of its document, by an id the builder
 * states, or by the id of its key. A key that states `asks: 'none'` is never asked.
 */
export function engineAsks(o: Opened, caller: Caller): boolean {
  if (asksNobody(o, caller)) return false
  const asks: unknown = Reflect.get(Object(o.description.project.mcp), 'asks')
  if (asks === 'client') return false
  if (!Array.isArray(asks)) return true
  const named = (one: string | undefined): boolean => one !== undefined && asks.includes(one)
  if (caller.kind === 'key' && caller.key) return !named(caller.key.id) && !named(keyAt(o, caller.key.id)?.key.name)
  if (caller.kind === 'mcp' && caller.grant) return !named(caller.grant.client) && !named(hostOf(caller.grant.client))
  return true
}
