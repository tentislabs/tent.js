import type { Stored } from '../record.ts'
import { isStored } from '../record.ts'
import { dayIn } from '../time.ts'

/** One declared state: its type, where it lives, and what it says of the browser's history and of other states. */
export interface StateEntry {
  type: Stored
  in?: 'address' | 'device' | 'browser'
  back: boolean
  reset: string[]
}

/**
 * Takes the `state` of a screen, a component or the project as the description stores it. Answers each state by
 * its name. An entry is a type, or a record of its type with where it lives.
 */
export function stateEntries(state: unknown): Record<string, StateEntry> {
  const entries: Record<string, StateEntry> = {}
  for (const [name, entry] of Object.entries(isStored(state) ? state : {})) {
    if (!isStored(entry)) continue
    const whole = isStored(entry.type) ? entry : undefined
    const type = whole && isStored(whole.type) ? whole.type : entry
    const lives = whole?.in
    entries[name] = {
      type,
      ...(lives === 'address' || lives === 'device' || lives === 'browser' ? { in: lives } : {}),
      back: whole?.back === true,
      reset: Array.isArray(whole?.reset) ? whole.reset.map(String) : [],
    }
  }
  return entries
}

/**
 * Takes a declared state, and the zone of the page where one is told. Answers what the state starts as: the default
 * of its type, worked out where it is `'today'`, the day in that zone, or `'now'`; false for a `boolean` with none,
 * and nothing for any other. The default is read as it is stored, and as a component that is a tag holds it written.
 */
export function startOfState(entry: StateEntry, zone?: string): unknown {
  const { kind, default: given } = entry.type
  if (kind === 'day' && (given === 'today' || (isStored(given) && given.today === true)))
    return dayIn(Date.now(), zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone)
  if (kind === 'date' && (given === 'now' || (isStored(given) && given.now === true))) return new Date().toISOString()
  return given !== undefined ? given : entry.type.kind === 'boolean' ? false : undefined
}

/** What stands after the question mark of an address, as far as a state is read from it. */
interface Search {
  getAll(name: string): string[]
}

/** One value of a state as an address writes it, read against its type: nothing where it does not fit. */
function read(type: Stored, written: string[], all: Search, name: string): unknown {
  const [first] = written
  switch (type.kind) {
    case 'text':
    case 'link':
    case 'day':
    case 'date': {
      if (first === undefined) return undefined
      const max = typeof type.max === 'number' ? type.max : Number.POSITIVE_INFINITY
      return first.length <= max ? first : undefined
    }
    case 'number': {
      const number = first === undefined || first.trim() === '' ? Number.NaN : Number(first)
      if (!Number.isFinite(number) || (type.whole === true && !Number.isInteger(number))) return undefined
      if (typeof type.min === 'number' && number < type.min) return undefined
      return typeof type.max === 'number' && number > type.max ? undefined : number
    }
    case 'boolean':
      return first === 'true' ? true : first === 'false' ? false : undefined
    case 'choice':
      return Array.isArray(type.values) && first !== undefined && type.values.includes(first) ? first : undefined
    case 'list': {
      // A list is written as its name once for each entry.
      const of = isStored(type.of) ? type.of : {}
      const entries = written.map((one) => read(of, [one], all, name))
      return written.length && entries.every((one) => one !== undefined) ? entries : undefined
    }
    case 'object': {
      // An object is written with dotted names.
      const made: Record<string, unknown> = {}
      for (const [field, inner] of Object.entries(isStored(type.shape) ? type.shape : {})) {
        const value = isStored(inner) ? read(inner, all.getAll(`${name}.${field}`), all, `${name}.${field}`) : undefined
        if (value !== undefined) made[field] = value
      }
      return Object.keys(made).length ? made : undefined
    }
    default:
      return undefined
  }
}

/**
 * Takes the declared states, and what stands after the question mark of an address. Answers the value of each
 * state that is kept in the address and is written there: one that does not fit its type is left out, so that the
 * state is its default. `under` is the `id` of the use of a component, or the ids of the uses around it joined by
 * a tilde: its states are written with that and a tilde before their names.
 */
export function readAddress(entries: Record<string, StateEntry>, search: Search, under = ''): Record<string, unknown> {
  const front = under === '' ? '' : `${under}~`
  const found: Record<string, unknown> = {}
  for (const [name, entry] of Object.entries(entries)) {
    if (entry.in !== 'address') continue
    const value = read(entry.type, search.getAll(`${front}${name}`), search, `${front}${name}`)
    if (value !== undefined) found[name] = value
  }
  return found
}

/** One value as an address writes it: a list once for each entry, and an object by dotted names. */
function written(name: string, value: unknown): [string, string][] {
  if (value === undefined || value === null) return []
  if (Array.isArray(value)) return value.flatMap((one) => written(name, one))
  if (isStored(value)) return Object.entries(value).flatMap(([key, one]) => written(`${name}.${key}`, one))
  return [[name, String(value)]]
}

/** Whether two values of a state are the same value: a list and an object are held entry by entry. */
export function sameValue(one: unknown, other: unknown): boolean {
  if (Object.is(one, other)) return true
  if (Array.isArray(one) && Array.isArray(other))
    return one.length === other.length && one.every((entry, place) => sameValue(entry, other[place]))
  if (isStored(one) && isStored(other)) {
    const keys = new Set([...Object.keys(one), ...Object.keys(other)])
    return [...keys].every((key) => sameValue(one[key], other[key]))
  }
  return false
}

/**
 * Takes the declared states and their values. Answers what an address holds of them after its question mark, as
 * pairs of a name and a text, in the order the states are declared. A value that equals its default is left out.
 */
export function writeAddress(
  entries: Record<string, StateEntry>,
  values: Record<string, unknown>,
  under = '',
): [string, string][] {
  const front = under === '' ? '' : `${under}~`
  return Object.entries(entries).flatMap(([name, entry]) =>
    entry.in !== 'address' || sameValue(values[name], startOfState(entry))
      ? []
      : written(`${front}${name}`, values[name]),
  )
}

/**
 * Takes a type and a value that was worked out. Answers the value as the type holds it: a number is brought to
 * its `min` or its `max`, and any other value that does not fit is nothing.
 */
export function heldToType(type: Stored, value: unknown): unknown {
  switch (type.kind) {
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
      if (type.whole === true && !Number.isInteger(value)) return undefined
      if (typeof type.min === 'number' && value < type.min) return type.min
      return typeof type.max === 'number' && value > type.max ? type.max : value
    }
    case 'boolean':
      return typeof value === 'boolean' ? value : undefined
    case 'choice':
      return Array.isArray(type.values) && type.values.includes(value) ? value : undefined
    case 'text':
    case 'link':
    case 'day':
    case 'date':
      if (typeof value !== 'string') return undefined
      return typeof type.max === 'number' && value.length > type.max ? undefined : value
    case 'list': {
      if (!Array.isArray(value)) return undefined
      const of = isStored(type.of) ? type.of : {}
      const held = value.map((one) => heldToType(of, one))
      return held.every((one) => one !== undefined) ? held : undefined
    }
    case 'object': {
      if (!isStored(value)) return undefined
      const shape = isStored(type.shape) ? type.shape : {}
      const held: Record<string, unknown> = {}
      for (const [field, one] of Object.entries(value)) {
        if (one === undefined || one === null) continue
        const inner = shape[field]
        const fits = isStored(inner) ? heldToType(inner, one) : undefined
        if (fits === undefined) return undefined
        held[field] = fits
      }
      return held
    }
    default:
      return value
  }
}

/**
 * Takes the declared states, their values, and what a `set` gives. Answers the states that change, each with its
 * new value: a value is held to its type first, one that is nothing or that its type does not hold sets nothing,
 * and a state whose `reset` names a state that changes goes back to its default, unless the `set` gives it too.
 */
export function afterSet(
  entries: Record<string, StateEntry>,
  state: Record<string, unknown>,
  given: Record<string, unknown>,
): Record<string, unknown> {
  const changed: Record<string, unknown> = {}
  const stated = new Set<string>()
  for (const [name, value] of Object.entries(given)) {
    if (value === undefined) continue
    const held = Object.hasOwn(entries, name) ? heldToType(entries[name].type, value) : value
    if (held === undefined) continue
    stated.add(name)
    if (!sameValue(state[name], held)) changed[name] = held
  }
  for (const [name, entry] of Object.entries(entries)) {
    if (stated.has(name) || !entry.reset.some((one) => Object.hasOwn(changed, one))) continue
    const start = startOfState(entry)
    if (!sameValue(state[name], start)) changed[name] = start
  }
  return changed
}

const signs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

/**
 * Takes the device states of an app that are not at their default, a state of the project under its name and a
 * state of a screen under the name of the screen, a dot and its own. Answers the value of the cookie that keeps
 * them: the JSON text of the record as base64url of its UTF-8 bytes, which holds no sign a cookie may not hold.
 * With no state it is empty.
 */
export function deviceText(states: Record<string, unknown>): string {
  if (!Object.keys(states).length) return ''
  const bytes = new TextEncoder().encode(JSON.stringify(states))
  let text = ''
  for (let at = 0; at < bytes.length; at += 3) {
    const [a, b, c] = [bytes[at], bytes[at + 1], bytes[at + 2]]
    text += signs[a >> 2]
    text += signs[((a & 3) << 4) | ((b ?? 0) >> 4)]
    if (b !== undefined) text += signs[((b & 15) << 2) | ((c ?? 0) >> 6)]
    if (c !== undefined) text += signs[c & 63]
  }
  return text
}

/**
 * Takes the name of the app and the origin the page is reached by. Answers the name of the cookie of the device
 * states: over https it starts `__Host-`, as the session cookie's does, so that a sister site cannot plant a choice.
 */
export const deviceCookie = (app: string, origin: string): string =>
  `${origin.startsWith('https:') ? '__Host-' : ''}tent_state.${app}`

/** Takes the value of the cookie of the device states. Answers the record it holds, and an empty one for any other text. */
export function deviceRead(text: string): Record<string, unknown> {
  if (text === '' || !/^[A-Za-z0-9_-]+$/.test(text)) return {}
  const bytes: number[] = []
  let held = 0
  let bits = 0
  for (const sign of text) {
    held = (held << 6) | signs.indexOf(sign)
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes.push((held >> bits) & 255)
    }
  }
  try {
    const read: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes)))
    return isStored(read) ? read : {}
  } catch {
    return {}
  }
}
