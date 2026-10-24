import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import { storedLimit } from '../limits.ts'
import type { Opened } from '../opened.ts'
import { callerOf } from './rule.ts'

/** What a call is asked of a person with: the text of a yes that came back with it, in `Tent-Agreed`. */
export interface Asks {
  agreed?: string
}

/** The key that the texts of one app are signed with, and the texts that were used, each with its end. */
interface Held {
  key: Buffer
  used: Map<string, number>
}

// Kept in memory alone: a restart ends every text, as it ends the yes that one stood for.
const held = new WeakMap<object, Held>()

const heldOf = (o: Opened): Held => {
  let made = held.get(o.handles)
  if (!made) {
    made = { key: randomBytes(32), used: new Map() }
    held.set(o.handles, made)
  }
  return made
}

/** A value as one text, with the fields of every record in the order of their names. */
function steady(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString())
  if (Array.isArray(value)) return `[${value.map(steady).join(',')}]`
  if (typeof value === 'object' && value !== null)
    return `{${Object.keys(value)
      .sort()
      .map((name) => `${JSON.stringify(name)}:${steady(Reflect.get(value, name))}`)
      .join(',')}}`
  return JSON.stringify(value) ?? 'null'
}

/** What a text holds: the function, the fingerprint of the input, the caller, and the moment it was made. */
const whatOf = (name: string, input: unknown, caller: Caller): string => {
  const { callerKind, callerId } = callerOf(caller)
  const print = createHash('sha256').update(steady(input)).digest('base64url')
  return `${name}\n${print}\n${callerKind}:${callerId ?? ''}`
}

/** Makes a text that only this engine can make and read, for one call with one input and one caller. */
function textOf(o: Opened, what: string): string {
  const body = Buffer.from(JSON.stringify({ at: o.clock.now(), n: randomBytes(9).toString('base64url') })).toString(
    'base64url',
  )
  const sign = createHmac('sha256', heldOf(o).key).update(`${body}\n${what}`).digest('base64url')
  return `${body}.${sign}`
}

/** Whether a text is one this engine made for this call, no older than `askTime`. */
function holds(o: Opened, text: string, what: string): boolean {
  const [body, sign] = text.split('.')
  if (!body || !sign) return false
  const made = createHmac('sha256', heldOf(o).key).update(`${body}\n${what}`).digest()
  const sent = Buffer.from(sign, 'base64url')
  if (sent.length !== made.length || !timingSafeEqual(sent, made)) return false
  let at: unknown
  try {
    at = Reflect.get(Object(JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))), 'at')
  } catch {
    return false
  }
  return typeof at === 'number' && o.clock.now() - at <= storedLimit(o.description, 'askTime')
}

/**
 * Asks a person before a function that states `danger: 'ask'` runs, after its input was checked: a text of a yes
 * that fits this function, this input and this caller, that was not used before and is no older than `askTime`,
 * lets it run once. Any other call is T7120, with a new text in `fields.ask`.
 */
export function agreedTo(o: Opened, name: string, input: unknown, caller: Caller, asks: Asks): void {
  const what = whatOf(name, input, caller)
  const { used } = heldOf(o)
  const now = o.clock.now()
  for (const [text, ends] of used) if (ends <= now) used.delete(text)
  const { agreed } = asks
  if (agreed !== undefined && !used.has(agreed) && holds(o, agreed, what)) {
    used.set(agreed, now + storedLimit(o.description, 'askTime'))
    return
  }
  throw new TentError('T7120', `${name} asks a person before it runs, and no yes came with this call.`, {
    fix: 'Ask the person, and send the same call again with the text of `fields.ask` in the header `Tent-Agreed`.',
    fields: { ask: textOf(o, what) },
  })
}
