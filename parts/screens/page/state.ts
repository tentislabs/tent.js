import { isStored, startOfState, stateEntries } from '../../core/internal.ts'
import type { ViewRecord } from './types.ts'
import { zoneNow } from './viewZone.ts'

/** Every state that the record of a screen declares, by its name: the state of the project, and the screen's own. */
const declaredBy = (record: ViewRecord): [string, unknown][] =>
  [record.shared, record.state].flatMap((declared) => Object.entries(isStored(declared) ? declared : {}))

/**
 * Takes the record of a screen. Answers every state that its view reads, each as it starts: the state of the
 * project, and the screen's own. The server and the browser both start a page from it.
 */
export function startingState(record: ViewRecord): Record<string, unknown> {
  const state: Record<string, unknown> = {}
  const entries = { ...stateEntries(record.shared), ...stateEntries(record.state) }
  for (const [name, entry] of Object.entries(entries)) state[name] = startOfState(entry, zoneNow())
  return state
}

/**
 * Takes the record of a screen, the state of a page as it holds, and what the request gave of it. Answers what the
 * page record holds: the state that is kept in the address and in the device, and no other. A state that lives in
 * the page starts in the browser from what the record of its screen declares.
 */
export function keptState(
  record: ViewRecord,
  state: Record<string, unknown>,
  given: Record<string, unknown>,
): Record<string, unknown> {
  const kept: Record<string, unknown> = { ...given }
  for (const [name, entry] of declaredBy(record))
    if (isStored(entry) && (entry.in === 'address' || entry.in === 'device') && state[name] !== undefined)
      kept[name] = state[name]
  return kept
}
