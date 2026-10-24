import { cannot } from './word.ts'

/** The units of a length of time, each with its stored length in milliseconds: a month is 30 days and a year 365. */
const units: Record<string, number> = {
  ms: 1,
  second: 1000,
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  week: 604_800_000,
  month: 2_592_000_000,
  year: 31_536_000_000,
}

/** Answers the unit that a word names, with or without its final `s`, or nothing where it names none. */
export function unitOf(word: unknown): string | undefined {
  if (typeof word !== 'string') return undefined
  if (Object.hasOwn(units, word)) return word
  return word.endsWith('s') && Object.hasOwn(units, word.slice(0, -1)) ? word.slice(0, -1) : undefined
}

/** The stored length of a unit, in milliseconds. */
export const msOf = (unit: string): number => units[unit]

const largestFirst = Object.entries(units).sort((a, b) => b[1] - a[1])

/** Takes a whole number of milliseconds from 0 up. Answers it in the largest unit that says it exactly: 0 is 0 ms. */
export function timeIn(ms: number): { n: number; unit: string } {
  const [unit, length] = largestFirst.find(([, one]) => ms >= one && ms % one === 0) ?? ['ms', 1]
  return { n: ms / length, unit }
}

// The units of a size, each 1,024 times the one before it, from a kilobyte.
const sizeUnits = ['KB', 'MB', 'GB']

/**
 * Takes a number of bytes. Answers it in the largest unit of a size that says it exactly, or nothing where it is no
 * whole number of kilobytes.
 */
export function sizeIn(bytes: number): { n: number; unit: string } | undefined {
  if (!Number.isInteger(bytes) || bytes < 1024 || bytes % 1024) return undefined
  const power = [3, 2, 1].find((one) => bytes % 1024 ** one === 0) ?? 1
  return { n: bytes / 1024 ** power, unit: sizeUnits[power - 1] }
}

/**
 * Takes a length of time in words, `'<number> <unit>'`, where the number may have a decimal part. Answers the
 * number and the unit, or nothing where the words do not read.
 */
export function lengthOf(words: unknown): { n: number; unit: string } | undefined {
  if (typeof words !== 'string') return undefined
  const read = /^(\d+(?:\.\d+)?) ([a-z]+)$/.exec(words.trim())
  const unit = read ? unitOf(read[2]) : undefined
  return read && unit ? { n: Number(read[1]), unit } : undefined
}

/**
 * Takes a size in words, a number and `KB`, `MB` or `GB`, counted in 1,024s. Answers the bytes, or nothing where
 * the words do not read.
 */
export function sizeOf(words: unknown): number | undefined {
  if (typeof words !== 'string') return undefined
  const read = /^(\d+(?:\.\d+)?) ([A-Z]+)$/.exec(words.trim())
  const power = read ? sizeUnits.indexOf(read[2]) + 1 : 0
  return read && power ? Math.round(Number(read[1]) * 1024 ** power) : undefined
}

/**
 * Answers the milliseconds of the start of a day of the calendar in UTC, from its year, its month counted from 0
 * and its day. The year is set by itself: the runtime reads a year under 100, handed in with a month, as one of
 * the twentieth century.
 */
function utcOf(year: number, month: number, day: number): number {
  const made = new Date(0)
  made.setUTCFullYear(year, month, day)
  return made.getTime()
}

const dayForm = /^(\d{4})-(\d{2})-(\d{2})$/
const momentForm = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/

/** Whether a value is a calendar day that the calendar has: a year, a month and a day, with hyphens between. */
export function isDay(value: unknown): value is string {
  const read = typeof value === 'string' ? dayForm.exec(value) : null
  if (!read) return false
  const [year, month, day] = [Number(read[1]), Number(read[2]), Number(read[3])]
  const made = new Date(utcOf(year, month - 1, day))
  // The calendar starts with the year 1: the form holds four digits, so it ends with the year 9999.
  return year >= 1 && made.getUTCFullYear() === year && made.getUTCMonth() === month - 1 && made.getUTCDate() === day
}

const first = utcOf(1, 0, 1)
const last = utcOf(9999, 11, 31) + 86_399_999

/** Whether so many milliseconds are a moment of the calendar: one whose day in UTC lies in the years 1 to 9999. */
export const inCalendar = (ms: number): boolean => ms >= first && ms <= last

/**
 * Answers the milliseconds of a moment, which is a `Date` or text in the standard form with its zone, whose day in
 * UTC is a day of the calendar, or nothing for any other value.
 */
export function momentOf(value: unknown): number | undefined {
  if (value instanceof Date) return inCalendar(value.getTime()) ? value.getTime() : undefined
  const read = typeof value === 'string' ? momentForm.exec(value) : null
  if (!read || !isDay(read[1])) return undefined
  const ms = Date.parse(read[0])
  return inCalendar(ms) ? ms : undefined
}

/** Answers a moment of so many milliseconds in the kind another moment was handed in: a `Date`, or text. */
export const momentAs = (like: unknown, ms: number): Date | string =>
  like instanceof Date ? new Date(ms) : new Date(ms).toISOString()

/** A number written with two digits at the least. */
export const two = (n: number): string => String(n).padStart(2, '0')

/** The parts of a day as numbers. */
function partsOf(day: string): [number, number, number] {
  return [Number(day.slice(0, 4)), Number(day.slice(5, 7)), Number(day.slice(8, 10))]
}

/** Writes a day from the count of days since the start of 1970. */
function dayFrom(count: number): string {
  const made = new Date(count * 86_400_000)
  return `${String(made.getUTCFullYear()).padStart(4, '0')}-${two(made.getUTCMonth() + 1)}-${two(made.getUTCDate())}`
}

/**
 * Takes a word, a day, a number and a unit. Answers the day moved on the calendar by that many whole days, weeks,
 * months or years, backwards for a number below zero: a move by months lands on the same day of that month, or on
 * its last day where it is shorter. Throws T0027 for another unit, for a number that is not whole, and for a move
 * that leaves the calendar.
 */
export function moveDay(word: string, day: string, n: number, unit: string): string {
  const moved = movedDay(word, day, n, unit)
  // The length as it was written: the word says which way it moves.
  const length = `${Math.abs(n)} ${unit}${Math.abs(n) === 1 ? '' : 's'}`
  return isDay(moved)
    ? moved
    : cannot(word, day, `a move that stays between 0001-01-01 and 9999-12-31, and ${length} does not`)
}

/** Moves a day by whole units, wherever that leads. */
function movedDay(word: string, day: string, n: number, unit: string): string {
  if (!Number.isInteger(n)) cannot(word, n, 'a whole number of units to move a day by')
  const [year, month, date] = partsOf(day)
  if (unit === 'day' || unit === 'week')
    return dayFrom(utcOf(year, month - 1, date) / 86_400_000 + n * (unit === 'week' ? 7 : 1))
  if (unit !== 'month' && unit !== 'year') return cannot(word, unit, 'days, weeks, months or years to move a day by')
  const months = year * 12 + (month - 1) + n * (unit === 'year' ? 12 : 1)
  const toYear = Math.floor(months / 12)
  const toMonth = months - toYear * 12
  const last = new Date(utcOf(toYear, toMonth + 1, 0)).getUTCDate()
  return `${String(toYear).padStart(4, '0')}-${two(toMonth + 1)}-${two(Math.min(date, last))}`
}

/** Whether the runtime knows a time zone by that name. */
export function isZone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || !zone) return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

/**
 * Answers the calendar day of a moment, in milliseconds, in a time zone that the runtime knows, or nothing where
 * that day lies outside the calendar: before the year 1, which the runtime counts in an era of its own, or after
 * the year 9999.
 */
export function dayIn(ms: number, zone: string): string | undefined {
  const part = partsIn(new Date(ms), zone)
  const day = `${String(part.year).padStart(4, '0')}-${two(part.month)}-${two(part.day)}`
  return part.era === 'AD' && isDay(day) ? day : undefined
}

/** The parts of a moment in a time zone. */
interface ZonedParts {
  era: string
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

/**
 * Takes a moment and a time zone. Answers the day and the time of day that the moment is there, as numbers, with
 * the era its year is counted in. Throws a RangeError for a zone that the runtime does not know.
 */
export function partsIn(moment: Date, zone: string): ZonedParts {
  const found: Record<string, number> = {}
  let era = ''
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    era: 'short',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).formatToParts(moment)
  for (const part of parts)
    if (part.type === 'era') era = part.value
    else if (part.type !== 'literal') found[part.type] = Number(part.value)
  return { era, year: found.year, month: found.month, day: found.day, hour: found.hour % 24, minute: found.minute }
}
