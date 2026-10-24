import { mark } from '../mark.ts'
import { dayIn, isDay, isZone, momentOf } from '../time.ts'
import { cannot, drawn, holdsReference } from '../word.ts'
import { asValue } from '../written.ts'

/**
 * Takes a moment, and the name of a time zone. Answers the calendar day of the moment in that zone, and with no
 * zone in the zone of the project, which it asks the engine for. A day answers itself, and nothing answers
 * nothing. Handed a reference, and with no zone where a definition is being made or no call is under way, it
 * answers its record. Throws T0027 for a zone the runtime does not know, for a value that is no moment, and for a moment whose day in
 * the zone lies outside the calendar.
 */
export function dayOf(moment: Date | string, zone?: string): string
export function dayOf(...values: unknown[]): unknown {
  if (holdsReference(values)) return mark({ fn: 'dayOf', args: values.map(asValue) })
  const [when, zone] = values
  if (when === undefined || when === null) return undefined
  if (isDay(when)) return when
  const ms = momentOf(when) ?? cannot('dayOf', when, 'a moment or a day')
  const named = zone === undefined ? drawn('zone', []) : { value: zone }
  if (!named) return mark({ fn: 'dayOf', args: [asValue(when)] })
  if (!isZone(named.value)) return cannot('dayOf', named.value, 'a time zone that the runtime knows')
  return dayIn(ms, named.value) ?? cannot('dayOf', when, `a moment whose day in ${named.value} lies in the calendar`)
}
