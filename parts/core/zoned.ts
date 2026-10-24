import { partsIn, two } from './time.ts'

/**
 * Takes a moment as the wire carries it and a time zone. Answers the day and the time of day that the moment is
 * there, as a control for a day and a time holds them: `2026-10-08T12:30`. Answers an empty text for what is no
 * moment, and for a zone that the runtime does not know.
 */
export function localIn(moment: unknown, zone: string): string {
  const at = typeof moment === 'string' ? new Date(moment) : undefined
  if (!at || Number.isNaN(at.getTime())) return ''
  try {
    const part = partsIn(at, zone)
    return `${String(part.year).padStart(4, '0')}-${two(part.month)}-${two(part.day)}T${two(part.hour)}:${two(part.minute)}`
  } catch {
    return ''
  }
}

/**
 * Takes a day and a time of day as a control holds them, or a day alone, and a time zone. Answers the moment that
 * it names in that zone, as the wire carries it: a day alone is the start of that day there. Answers nothing for a
 * text of another form. A time that the clocks of the zone skip is the moment an hour later.
 */
export function momentIn(local: string, zone: string): string | undefined {
  const read = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(local)
  if (!read) return undefined
  const [year, month, day, hour, minute] = read.slice(1).map((one) => Number(one ?? 0))
  const wanted = Date.UTC(year, month - 1, day, hour, minute)
  try {
    // The zone is that much ahead of the clock of the world at the moment that is asked for: two tries find it,
    // also across a day on which the clocks change.
    let guess = wanted
    for (let tries = 0; tries < 2; tries++) {
      const part = partsIn(new Date(guess), zone)
      const shown = Date.UTC(part.year, part.month - 1, part.day, part.hour, part.minute)
      guess -= shown - wanted
    }
    return new Date(guess).toISOString()
  } catch {
    return undefined
  }
}
