import { isStored } from './record.ts'
import { momentIn } from './zoned.ts'

/** What a form sends, by the names of its controls: a name once for each value, as the plain form type holds them. */
export interface SentFields {
  has(name: string): boolean
  get(name: string): string | null
  getAll(name: string): string[]
}

/** One field of an input, as it is read from what a form sends: where it stands, and how its text is read. */
interface Read {
  path: string[]
  dotted: string
  how: 'one' | 'boolean' | 'list'
  text: (text: string | null, zone: string) => unknown
}

/** How the text of a field is read by its type: nothing where it was not sent or sent empty. */
function textReader(type: Record<string, unknown>): (text: string | null, zone: string) => unknown {
  const kind = type.kind
  const values = Array.isArray(type.values) ? [...type.values] : []
  return (text, zone) => {
    if (text === null || text === '') return undefined
    if (kind === 'number') {
      const number = Number(text)
      return Number.isFinite(number) ? number : text
    }
    if (kind === 'date') return momentIn(text, zone) ?? text
    if (kind === 'choice') {
      // A select that a form drives sends the place of the option among the values of the type.
      const place = /^\d+$/.test(text) ? Number(text) : -1
      return values.includes(text) || place < 0 || place >= values.length ? text : values[place]
    }
    return text
  }
}

/** The fields of an input, each with how it is read, a field of an object by its dotted name. */
function readsOf(input: Record<string, unknown>, under: string[] = []): Read[] {
  const found: Read[] = []
  for (const [name, stored] of Object.entries(input)) {
    if (!isStored(stored)) continue
    const path = [...under, name]
    const dotted = path.join('.')
    if (stored.kind === 'object' && isStored(stored.shape)) found.push(...readsOf(stored.shape, path))
    else if (stored.kind === 'boolean') found.push({ path, dotted, how: 'boolean', text: () => undefined })
    else if (stored.kind === 'list')
      found.push({ path, dotted, how: 'list', text: textReader(isStored(stored.of) ? stored.of : {}) })
    else found.push({ path, dotted, how: 'one', text: textReader(stored) })
  }
  return found
}

/**
 * Takes the types of the input of a function. Answers what reads what a form sends, by the names of its controls,
 * in the time zone of the visitor, into the input, each field by its type: text as it is; a number, a day and a
 * choice from their text; a `date` in the zone; a `boolean` as true when its name is there and as false when it is
 * not; a list as its name once for each entry; an object by dotted names. The types are read once, here, and what
 * it answers reads none: a page makes it when it draws a form, and reads each send with it.
 */
export function fieldsReader(
  input: Record<string, unknown>,
): (sent: SentFields, zone: string) => Record<string, unknown> {
  const reads = readsOf(input)
  return (sent, zone) => {
    const read: Record<string, unknown> = {}
    for (const one of reads) {
      let value: unknown
      if (one.how === 'boolean') value = sent.has(one.dotted)
      else if (one.how === 'list') {
        const entries = sent.getAll(one.dotted).map((text) => one.text(text, zone))
        value = entries.length ? entries.filter((entry) => entry !== undefined) : undefined
      } else value = one.text(sent.get(one.dotted), zone)
      if (value === undefined) continue
      let at = read
      for (const part of one.path.slice(0, -1)) {
        const next = isStored(at[part]) ? at[part] : {}
        at[part] = next
        at = next
      }
      at[one.path[one.path.length - 1]] = value
    }
    return read
  }
}

/** Takes the types of the input of a function, what a form sent and the time zone of the visitor. Answers the input, as `fieldsReader` reads it. */
export const readFields = (input: Record<string, unknown>, sent: SentFields, zone: string): Record<string, unknown> =>
  fieldsReader(input)(sent, zone)

/** What a form held, by the names of its fields, as text: what a failed form shows again. A secret is left out. */
export function typedOf(input: Record<string, unknown>, sent: SentFields, under = ''): Record<string, unknown> {
  const typed: Record<string, unknown> = {}
  for (const [name, stored] of Object.entries(input)) {
    if (!isStored(stored) || stored.secret === true) continue
    const field = under ? `${under}.${name}` : name
    if (stored.kind === 'object' && isStored(stored.shape)) Object.assign(typed, typedOf(stored.shape, sent, field))
    else if (stored.kind === 'boolean') typed[field] = sent.has(field)
    else if (stored.kind === 'list') typed[field] = sent.getAll(field)
    else if (sent.has(field)) typed[field] = sent.get(field)
  }
  return typed
}
