import { inCalendar, isDay, lengthOf, momentAs, momentOf, moveDay, msOf, unitOf } from './time.ts'
import { cannot } from './word.ts'

/**
 * Takes a word, a moment or a day, a length of time in words, and 1 for later or -1 for earlier. Answers it moved
 * by the length, in the kind it was handed, and nothing for nothing. Throws T0027 for a length that does not read,
 * for a unit a day does not have, for a move that leaves the calendar, and for a value that is neither a moment
 * nor a day.
 */
export function moved(word: string, when: unknown, length: unknown, sign: 1 | -1): unknown {
  if (when === undefined || when === null) return undefined
  const read = lengthOf(length) ?? cannot(word, length, "a length of time, as '7 days'")
  if (isDay(when)) return moveDay(word, when, sign * read.n, read.unit)
  const ms = momentOf(when) ?? cannot(word, when, 'a moment or a day')
  const to = ms + sign * read.n * msOf(read.unit)
  return inCalendar(to) ? momentAs(when, to) : cannot(word, when, 'a move that stays inside the calendar')
}

/** How many whole units lie from one day to a later one: the largest number for which the first, moved, is not after the second. */
function daysApart(a: string, b: string, unit: string): number {
  if (b < a) return -daysApart(b, a, unit)
  const [years, months] = [Number(b.slice(0, 4)) - Number(a.slice(0, 4)), Number(b.slice(5, 7)) - Number(a.slice(5, 7))]
  const days = (Date.parse(b) - Date.parse(a)) / 86_400_000
  let n =
    unit === 'day' ? days : unit === 'week' ? Math.floor(days / 7) : unit === 'month' ? years * 12 + months : years
  while (n > 0 && moveDay('between', a, n, unit) > b) n--
  return n
}

/**
 * Takes two moments or two days, and a unit. Answers how many whole units lie from the first to the second, and
 * nothing where either is nothing. Throws T0027 for one of each kind, and for a unit that the kind does not have.
 */
export function unitsBetween(a: unknown, b: unknown, unit: unknown): unknown {
  if (a === undefined || a === null || b === undefined || b === null) return undefined
  const named = unitOf(unit) ?? cannot('between', unit, 'a unit of time')
  if (isDay(a) && isDay(b)) {
    if (!['day', 'week', 'month', 'year'].includes(named))
      cannot('between', unit, 'days, weeks, months or years for two days')
    return daysApart(a, b, named)
  }
  const [from, to] = [momentOf(a), momentOf(b)]
  if (from === undefined || to === undefined)
    return cannot('between', from === undefined ? a : b, 'two moments or two days')
  return Math.trunc((to - from) / msOf(named))
}
