import { afterSet, readAddress, startOfState, stateEntries } from '../../core/internal.ts'
import { useState } from '../borrowed/react.ts'
import type { PageStore } from './store.ts'
import type { ViewRecord } from './types.ts'
import { zoneNow } from './viewZone.ts'

type Names = Record<string, unknown>

/** How a view changes state: with the values, and whether a press made the change, which it did where nothing says. */
export type SetState = (values: Names, how?: { press?: boolean }) => void

/** What a view was handed of state: its values, and what changes them. */
export interface GiverState {
  state: Names
  set: SetState
}

/**
 * The state of one use of a component. Takes the record of the component, the `id` of the use with the ids of
 * the uses around it, and the page. Answers the state that the view of the component reads, and what changes it.
 * Each use has its own state. One that is kept in the address is written under the `id` of the use, a tilde and
 * its name, and is read from the address at every drawing, so the back button sets it. Every other name is a state
 * of the project.
 */
export function useOwnState(record: ViewRecord, under: string | undefined, store: PageStore): GiverState {
  const entries = stateEntries(record.state)
  const [held, hold] = useState<Names>(() => {
    const start: Names = {}
    for (const [name, entry] of Object.entries(entries)) start[name] = startOfState(entry, zoneNow())
    return start
  })
  const kept = under === undefined ? {} : readAddress(entries, store.search(), under)
  const own: Names = {}
  for (const [name, entry] of Object.entries(entries)) {
    if (entry.in === 'address' && under !== undefined)
      own[name] = Object.hasOwn(kept, name) ? kept[name] : startOfState(entry, zoneNow())
    else own[name] = held[name]
  }
  const set: SetState = (values, how) => {
    const mine: Names = {}
    const shared: Names = {}
    for (const [name, value] of Object.entries(values)) {
      if (Object.hasOwn(entries, name)) mine[name] = value
      else shared[name] = value
    }
    if (Object.keys(shared).length) store.set(shared, how)
    const changed = afterSet(entries, own, mine)
    if (!Object.keys(changed).length) return
    hold((before) => ({ ...before, ...changed }))
    // The address is written only where a state that lives in it changed, and a step is added only for one that says so.
    const written = Object.keys(changed).filter((name) => entries[name]?.in === 'address')
    if (under !== undefined && written.length)
      store.wrote(
        under,
        entries,
        { ...own, ...changed },
        how?.press !== false && written.some((name) => entries[name].back),
      )
  }
  return { state: { ...store.state, ...own }, set }
}
