import { lengthOf, isWritten } from '../core/internal.ts'
import { msOf } from './lengths.ts'

const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const minute = 60_000

/** A moment as the clock of a zone shows it. */
interface Shown {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  weekday: number
}

const readers = new Map<string, Intl.DateTimeFormat>()

/** Answers what the clock of a zone shows at a moment. */
function shownIn(zone: string, at: number): Shown {
  let reader = readers.get(zone)
  if (!reader) {
    reader = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      weekday: 'long',
    })
    readers.set(zone, reader)
  }
  const parts: Record<string, string> = {}
  for (const part of reader.formatToParts(new Date(at))) parts[part.type] = part.value
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: weekdays.indexOf(String(parts.weekday).toLowerCase()),
  }
}

/** One field of a cron schedule as the set of numbers it names. */
function fieldOf(text: string, from: number, to: number): Set<number> | undefined {
  const named = new Set<number>()
  for (const part of text.split(',')) {
    const read = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part)
    if (!read) return undefined
    const [low, high] = read[1] === '*' ? [from, to] : read[1].split('-').map(Number)
    const last = high ?? (read[2] === undefined ? low : to)
    const by = read[2] === undefined ? 1 : Number(read[2])
    if (low < from || last > to || low > last || by < 1) return undefined
    for (let n = low; n <= last; n += by) named.add(n)
  }
  return named
}

/** What a moment of a zone's clock must show for a schedule to fire then. */
type Fits = (shown: Shown) => boolean

/** The five fields of cron, as what a moment must show. Sunday is 0, and 7 too. */
function cronFits(schedule: string): Fits | undefined {
  const fields = schedule.trim().split(/\s+/)
  if (fields.length !== 5) return undefined
  const [minutes, hours, days, months, weekdaysNamed] = [
    fieldOf(fields[0], 0, 59),
    fieldOf(fields[1], 0, 23),
    fieldOf(fields[2], 1, 31),
    fieldOf(fields[3], 1, 12),
    fieldOf(fields[4], 0, 7),
  ]
  if (!minutes || !hours || !days || !months || !weekdaysNamed) return undefined
  if (weekdaysNamed.has(7)) weekdaysNamed.add(0)
  const [anyDay, anyWeekday] = [fields[2] === '*', fields[4] === '*']
  return (shown) => {
    if (!minutes.has(shown.minute) || !hours.has(shown.hour) || !months.has(shown.month)) return false
    const [day, weekday] = [days.has(shown.day), weekdaysNamed.has(shown.weekday)]
    // Where both the day of the month and the weekday are held, cron fires on a day that fits either.
    return anyDay || anyWeekday ? day && weekday : day || weekday
  }
}

/** The words of `every` that name a time of the day, as what a moment must show. */
function everyFits(words: string): Fits | undefined {
  const read = /^(day|[a-z]+day|month on (\d+)) at (\d\d):(\d\d)$/.exec(words)
  if (!read) return undefined
  const [hour, min] = [Number(read[3]), Number(read[4])]
  const weekday = weekdays.indexOf(read[1])
  const dayOfMonth = read[2] === undefined ? undefined : Number(read[2])
  if (read[1] !== 'day' && weekday < 0 && dayOfMonth === undefined) return undefined
  return (shown) =>
    shown.hour === hour &&
    shown.minute === min &&
    (weekday < 0 || shown.weekday === weekday) &&
    (dayOfMonth === undefined || shown.day === dayOfMonth)
}

// How many days ahead a schedule is looked for: a day of a month that few months have comes within these years.
const lookAhead = 5 * 366

/** How many minutes after what a moment shows the day it shows first fits, the moment itself among them, or nothing. */
function fitsToday(fits: Fits, shown: Shown): number | undefined {
  for (let hour = shown.hour; hour < 24; hour += 1)
    for (let min = hour === shown.hour ? shown.minute : 0; min < 60; min += 1)
      if (fits({ ...shown, hour, minute: min })) return (hour - shown.hour) * 60 + min - shown.minute
  return undefined
}

/** The first whole minute after a moment at which the clock of a zone shows what fits. */
function firstFit(fits: Fits, zone: string, after: number): number | undefined {
  let at = Math.floor(after / minute) * minute + minute
  // A day is looked at a few times at most: where its clock is set forward or back, the moment found is held again.
  for (let looked = 0; looked < lookAhead * 4; looked += 1) {
    const shown = shownIn(zone, at)
    const ahead = fitsToday(fits, shown)
    if (ahead === 0) return at
    // A day that does not fit is passed over whole, by what is left of it on the clock of the zone.
    at += (ahead ?? (24 - shown.hour) * 60 - shown.minute) * minute
  }
  return undefined
}

/**
 * Takes a timed trigger as it is stored, the zone of the project, the moment after which it is to fire, and the
 * moment it fired last where it has. Answers the next moment it fires, or nothing for what is no timed trigger
 * and for a schedule that never comes.
 */
export function nextTime(trigger: unknown, zone: string, after: number, last?: number): number | undefined {
  if (!isWritten(trigger)) return undefined
  if (typeof trigger.cron === 'string') {
    const fits = cronFits(trigger.cron)
    return fits ? firstFit(fits, typeof trigger.zone === 'string' ? trigger.zone : zone, after) : undefined
  }
  if (typeof trigger.every !== 'string') return undefined
  if (lengthOf(trigger.every)) {
    // A length is counted on from the last time, and a time that was missed is made up once and not once for each.
    const every = msOf(trigger.every)
    if (!(every > 0)) return undefined
    const from = last ?? after
    return from + Math.max(1, Math.ceil((after - from + 1) / every)) * every
  }
  const fits = everyFits(trigger.every)
  return fits ? firstFit(fits, zone, after) : undefined
}
