import { localIn, momentIn, projectZone } from '../../core/internal.ts'
import type { Opened } from '../opened.ts'

/** The zone of the project, by which a day of the counts and of the limits is cut. */
const zoneOf = (o: Opened): string => projectZone(o.description.project)

/** The moment at which the day of a moment began in the zone of the project. */
export function dayOf(o: Opened, at: number = o.clock.now()): Date {
  const zone = zoneOf(o)
  const local = localIn(new Date(at).toISOString(), zone).slice(0, 10)
  const start = local ? momentIn(local, zone) : undefined
  return new Date(start ?? new Date(at).toISOString().slice(0, 10))
}
