import { isStored, momentIn } from '../../core/internal.ts'
import type { FileRecord } from './records.ts'

/** How the values of a file are read: the names it maps, its language, the messages of the app, and its zone. */
export interface ValuesReading {
  map: Record<string, string>
  language: string
  messages: Record<string, unknown>
  zone: string
}

/** A value that is read, or why it is not. */
type Read = { value: unknown } | { why: string }

const two = (n: number): string => String(n).padStart(2, '0')

/** The signs a language writes a number with: before the decimals, and between thousands. */
function signsOf(language: string): { point: string; group: string } {
  try {
    const parts = new Intl.NumberFormat(language, { useGrouping: true }).formatToParts(12345.6)
    return {
      point: parts.find((part) => part.type === 'decimal')?.value ?? '.',
      group: parts.find((part) => part.type === 'group')?.value ?? ',',
    }
  } catch {
    return { point: '.', group: ',' }
  }
}

/** A number as a person writes it in a language: with its signs between thousands, a space among them, or none. */
function numberOf(text: string, language: string): Read {
  const { point, group } = signsOf(language)
  const bare = text
    .trim()
    .replace(/[\s  ]/g, '')
    .split(group)
    .join('')
    .replace(point, '.')
  return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(bare) ? { value: Number(bare) } : { why: 'is no number' }
}

/** The order in which a language writes the day, the month and the year of a date. */
function orderOf(language: string): ('day' | 'month' | 'year')[] {
  try {
    const parts = new Intl.DateTimeFormat(language, {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
    }).formatToParts(new Date(Date.UTC(2001, 1, 3)))
    const order = parts.flatMap((part) =>
      part.type === 'day' || part.type === 'month' || part.type === 'year' ? [part.type] : [],
    )
    return order.length === 3 ? order : ['year', 'month', 'day']
  } catch {
    return ['year', 'month', 'day']
  }
}

/**
 * A day and a time of day as a person writes them: in the standard form, or in the order of the language, as
 * a day, a month and a year with dots or slashes between, with a time after it. Answers the day in the standard
 * form, and the time, or nothing.
 */
function dayAndTime(text: string, language: string): { day: string; time?: string; zoned?: string } | undefined {
  const standard = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.exec(
    text.trim(),
  )
  if (standard) {
    const [, year, month, day, hour, minute, second, zone] = standard
    const time = hour === undefined ? undefined : `${hour}:${minute}:${second ?? '00'}`
    return { day: `${year}-${month}-${day}`, ...(time ? { time } : {}), ...(zone ? { zoned: text.trim() } : {}) }
  }
  const written = /^(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(text.trim())
  if (!written) return undefined
  const order = orderOf(language)
  const parts: Record<string, number> = {}
  for (const [at, name] of order.entries()) parts[name] = Number(written[at + 1])
  const year = parts.year < 100 ? 2000 + parts.year : parts.year
  const at = new Date(Date.UTC(year, parts.month - 1, parts.day))
  if (at.getUTCMonth() !== parts.month - 1 || at.getUTCDate() !== parts.day) return undefined
  const day = `${String(year).padStart(4, '0')}-${two(parts.month)}-${two(parts.day)}`
  const [hour, minute, second] = [written[4], written[5], written[6]]
  return { day, ...(hour === undefined ? {} : { time: `${two(Number(hour))}:${minute}:${second ?? '00'}` }) }
}

/** A moment, from what a file holds: a moment of a spreadsheet, or a text, in the zone of the app where it names none. */
function momentOf(value: unknown, reading: ValuesReading): Read {
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? { why: 'is no moment' } : { value: value.toISOString() }
  const read = dayAndTime(String(value), reading.language)
  if (!read) return { why: 'is no moment' }
  if (read.zoned) {
    const at = Date.parse(read.zoned)
    return Number.isNaN(at) ? { why: 'is no moment' } : { value: new Date(at).toISOString() }
  }
  const [hour, minute, second] = (read.time ?? '00:00:00').split(':')
  const at = momentIn(`${read.day}T${hour}:${minute}`, reading.zone)
  return at === undefined
    ? { why: 'is no moment' }
    : { value: new Date(Date.parse(at) + Number(second) * 1000).toISOString() }
}

/** A day of the calendar, from what a file holds, in the standard form. */
function dayOf(value: unknown, reading: ValuesReading): Read {
  if (value instanceof Date)
    return Number.isNaN(value.getTime())
      ? { why: 'is no day' }
      : { value: `${value.getUTCFullYear()}-${two(value.getUTCMonth() + 1)}-${two(value.getUTCDate())}` }
  const read = dayAndTime(String(value), reading.language)
  return read && read.time === undefined ? { value: read.day } : { why: 'is no day' }
}

/** A value of a choice, by the value itself or by its word in a language of the app, the file's first. */
function choiceOf(value: unknown, type: Record<string, unknown>, reading: ValuesReading): Read {
  const values = Array.isArray(type.values) ? type.values.map(String) : []
  const text = String(value).trim()
  const same = (a: string, b: string): boolean => a.localeCompare(b, reading.language, { sensitivity: 'base' }) === 0
  const found = values.find((one) => one === text) ?? values.find((one) => same(one, text))
  if (found !== undefined) return { value: found }
  if (typeof type.messages === 'string') {
    const languages = [reading.language, ...Object.keys(reading.messages).filter((one) => one !== reading.language)]
    for (const language of languages) {
      const words = reading.messages[language]
      if (!isStored(words)) continue
      const word = values.find((one) => {
        const said = words[`${type.messages}.${one}`]
        return typeof said === 'string' && same(said, text)
      })
      if (word !== undefined) return { value: word }
    }
  }
  return { why: `is none of ${values.join(', ')}` }
}

/** Yes or no, as a person writes it. */
function yesOrNo(value: unknown): Read {
  if (typeof value === 'boolean') return { value }
  const text = String(value).trim().toLowerCase()
  if (['true', 'yes', 'y', '1', 'x'].includes(text)) return { value: true }
  if (['false', 'no', 'n', '0'].includes(text)) return { value: false }
  return { why: 'is neither yes nor no' }
}

/** One value of a file, read by the type of its field of the input as a person writes such a value. */
function valueOf(value: unknown, type: unknown, reading: ValuesReading): Read {
  const stated: Record<string, unknown> = isStored(type) ? type : {}
  switch (stated.kind) {
    case 'text':
    case 'link':
    case 'file':
      return { value: value instanceof Date ? value.toISOString() : String(value).trim() }
    case 'number':
      return typeof value === 'number' ? { value } : numberOf(String(value), reading.language)
    case 'boolean':
      return yesOrNo(value)
    case 'date':
      return momentOf(value, reading)
    case 'day':
      return dayOf(value, reading)
    case 'choice':
      return choiceOf(value, stated, reading)
    case 'list': {
      const text = String(value)
      const items = Array.isArray(value) ? value : text.split(text.includes(';') ? ';' : ',').map((one) => one.trim())
      const read: unknown[] = []
      for (const one of items.filter((item) => item !== '')) {
        const each = valueOf(one, stated.of, reading)
        if ('why' in each) return each
        read.push(each.value)
      }
      return { value: read }
    }
    case 'json':
    case 'object':
      if (typeof value !== 'string') return { value }
      try {
        return { value: JSON.parse(value) }
      } catch {
        return stated.kind === 'json' ? { value } : { why: 'is no record' }
      }
    default:
      return { value }
  }
}

/**
 * Takes a record of a file, the fields of the input of the change it goes to, and how it is read. Matches each
 * field of the file to a field of the input, by `map` and then by its name, in any case, and leaves out a field
 * that matches none. Reads each value by the type of its field. Answers the input, or the first field whose value
 * does not read, and why.
 */
export function recordInput(
  record: FileRecord,
  fields: Record<string, unknown>,
  reading: ValuesReading,
): { input: Record<string, unknown> } | { field: string; why: string } {
  const names = Object.keys(fields)
  const input: Record<string, unknown> = {}
  for (const [name, value] of Object.entries(record.fields)) {
    const mapped = Object.hasOwn(reading.map, name) ? reading.map[name] : name
    const field = names.find((one) => one === mapped) ?? names.find((one) => one.toLowerCase() === mapped.toLowerCase())
    if (field === undefined) continue
    const read = valueOf(value, fields[field], reading)
    if ('why' in read) return { field, why: `${JSON.stringify(String(value)).slice(0, 60)} ${read.why}` }
    input[field] = read.value
  }
  return { input }
}
