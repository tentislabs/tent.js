import type { StateEntry } from '../../core/internal.ts'
import {
  afterSet,
  deviceCookie,
  deviceRead,
  deviceText,
  heldToType,
  isStored,
  readAddress,
  sameValue,
  startOfState,
  stateEntries,
  writeAddress,
} from '../../core/internal.ts'
import type { Reach } from './reach.ts'
import type { Page, ViewRecord } from './types.ts'
import { zoneNow } from './viewZone.ts'

/** The declared states of a page, with what tells the states of its screen from those of the project. */
interface Declared {
  entries: Record<string, StateEntry>
  // The name a state is kept under in the device and in the browser: a state of a screen under the name of its screen.
  under(name: string): string
  app: string
}

/** The states that the record of a screen declares: the project's, and its own. */
function declaredBy(record: ViewRecord | undefined, reach: Reach): Declared {
  const own = stateEntries(record?.state)
  return {
    entries: { ...stateEntries(record?.shared), ...own },
    under: (name) => (record && Object.hasOwn(own, name) ? `${record.name}.${name}` : name),
    app: reach.app ?? '',
  }
}

/** What an address writes after its question mark: a tilde, which stands between the `id` of a use and its state, is written as it is. */
const writtenOf = (search: URLSearchParams): string => search.toString().replaceAll('%7E', '~')

/** What stands after the question mark of the address that a browser shows. */
const searchOf = (reach: Reach): URLSearchParams => {
  const shown = reach.shows?.() ?? ''
  const mark = shown.indexOf('?')
  return new URLSearchParams(mark < 0 ? '' : shown.slice(mark + 1))
}

/**
 * Takes the state of a page record. Answers what the address held of the states of the uses of components, which
 * the record carries as it was written, each under the `id` of its use, a tilde and its name: a use reads its own
 * against its types.
 */
export function passed(state: Record<string, unknown>): { getAll(name: string): string[] } {
  return {
    getAll: (name) => {
      const written = name.includes('~') ? state[name] : undefined
      return Array.isArray(written) ? written.map(String) : []
    },
  }
}

/** What stands after the question mark of the address of a page: what the browser shows, or what the record carried. */
export function searchFor(reach: Reach, page: Page): { getAll(name: string): string[] } {
  return reach.shows ? searchOf(reach) : passed(page.state)
}

/**
 * Takes the reach of a page, the `id` of a use of a component, its states and their values, and whether the change
 * is one more step of the history. Writes the states that the use keeps in the address, each under the `id`, a tilde and its name.
 */
export function wroteUnder(
  reach: Reach,
  under: string,
  entries: Record<string, StateEntry>,
  values: Record<string, unknown>,
  step: boolean,
): void {
  if (!reach.address) return
  const kept = Object.entries(entries).filter(([, entry]) => entry.in === 'address')
  if (!kept.length) return
  const search = searchOf(reach)
  for (const [name] of kept) {
    const front = `${under}~${name}`
    for (const key of [...search.keys()]) if (key === front || key.startsWith(`${front}.`)) search.delete(key)
  }
  for (const [name, value] of writeAddress(entries, values, under)) search.append(name, value)
  reach.address(writtenOf(search), step)
}

/** The name of the store of the browser that holds the states of one caller: a user by their id, and a visitor apart. */
const storeName = (declared: Declared, page: Page): string => `tent_state.${declared.app}.${page.user?.id ?? ''}`

/** Reads the record that the browser's own store keeps for this caller, or an empty one for what is no record. */
function storeRead(reach: Reach, name: string): Record<string, unknown> {
  try {
    const read: unknown = JSON.parse(reach.kept?.get(name) ?? '{}')
    return isStored(read) ? read : {}
  } catch {
    return {}
  }
}

/**
 * Takes the record of the screen of a page, the page and its reach. Answers the states that the first HTML does not
 * know, each as its type holds it, which the page puts in when it comes alive: those that the browser keeps in its
 * own store for this caller, and on an exported page, which was written before any visit, those of the device that
 * its cookie holds. A kept value that no longer fits its type is left out, so it is the default.
 */
export function keptInBrowser(record: ViewRecord | undefined, page: Page, reach: Reach): Record<string, unknown> {
  const declared = declaredBy(record, reach)
  const found: Record<string, unknown> = {}
  const stored = reach.kept ? storeRead(reach, storeName(declared, page)) : {}
  const cookie = page.exported && reach.cookie ? reach.cookie.get(deviceCookie(declared.app, page.origin)) : undefined
  const device = cookie === undefined ? {} : deviceRead(cookie)
  for (const [name, entry] of Object.entries(declared.entries)) {
    const held = entry.in === 'browser' ? stored : entry.in === 'device' ? device : {}
    const kept = held[declared.under(name)]
    const fits = kept === undefined || kept === null ? undefined : heldToType(entry.type, kept)
    if (fits !== undefined) found[name] = fits
  }
  return found
}

/**
 * Takes the record of the screen of a page and its reach. Answers the value of every state that is kept in the
 * address, as the address that the browser shows now writes it: one that is not written is its default. It is
 * what the back button sets, and it resets nothing.
 */
export function readFromAddress(record: ViewRecord | undefined, reach: Reach): Record<string, unknown> {
  const { entries } = declaredBy(record, reach)
  const written = readAddress(entries, searchOf(reach))
  const read: Record<string, unknown> = {}
  for (const [name, entry] of Object.entries(entries))
    if (entry.in === 'address')
      read[name] = Object.hasOwn(written, name) ? written[name] : startOfState(entry, zoneNow())
  return read
}

/**
 * Takes the record of the screen of a page, the page, its reach, the state as it holds, what a `set` gives, and
 * whether a press made the change. Changes the state, and writes each changed state where it lives: into the
 * address, in the place of the one that is shown, or as one more step of the history where a press changed a
 * state that says `back: true`; into the one cookie of the app; into the browser's own store. Answers whether
 * anything changed.
 */
export function setKept(o: {
  record: ViewRecord | undefined
  page: Page
  reach: Reach
  state: Record<string, unknown>
  values: Record<string, unknown>
  press: boolean
}): boolean {
  const declared = declaredBy(o.record, o.reach)
  const { entries } = declared
  const changed = afterSet(entries, o.state, o.values)
  const names = Object.keys(changed)
  if (!names.length) return false
  Object.assign(o.state, changed)
  const lives = (where: string): string[] => names.filter((name) => entries[name]?.in === where)
  const inAddress = lives('address')
  if (inAddress.length && o.reach.address) {
    // What the address holds of another kind stays: only the states of this screen are written anew.
    const search = searchOf(o.reach)
    for (const [name, entry] of Object.entries(entries)) {
      if (entry.in !== 'address') continue
      for (const key of [...search.keys()]) if (key === name || key.startsWith(`${name}.`)) search.delete(key)
    }
    for (const [name, value] of writeAddress(entries, o.state)) search.append(name, value)
    o.reach.address(writtenOf(search), o.press && inAddress.some((name) => entries[name].back))
  }
  if (lives('device').length && o.reach.cookie) {
    const cookie = deviceCookie(declared.app, o.page.origin)
    const held = deviceRead(o.reach.cookie.get(cookie) ?? '')
    for (const name of lives('device')) {
      if (sameValue(o.state[name], startOfState(entries[name], zoneNow()))) delete held[declared.under(name)]
      else held[declared.under(name)] = o.state[name]
    }
    o.reach.cookie.set(cookie, deviceText(held))
  }
  if (lives('browser').length && o.reach.kept) {
    const store = storeName(declared, o.page)
    const held = storeRead(o.reach, store)
    for (const name of lives('browser')) {
      if (sameValue(o.state[name], startOfState(entries[name], zoneNow()))) delete held[declared.under(name)]
      else held[declared.under(name)] = o.state[name]
    }
    o.reach.kept.set(store, JSON.stringify(held))
  }
  return true
}
