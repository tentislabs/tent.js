import type { Tx } from '../data/index.ts'
import type { Held } from './held.ts'
import { keyText } from './keys.ts'
import type { RunRow } from './rows.ts'
import { readRunRows } from './rows.ts'
import { unfinished } from './states.ts'
import { isWritten } from '../core/internal.ts'

/**
 * Takes the write that emits an event, the event and its data. Answers the runs that its `stopOn` stops: of each
 * flow of the live version that names the event, the runs that have not ended and whose key is the one that the
 * key of the event answers over its data. Only the runs of the file of that write are read, so an event stops no
 * run of another file.
 */
export function stoppedBy(held: Held, tx: Tx, what: { event: string; data: unknown }): RunRow[] {
  const live = held.live
  if (live === undefined) return []
  const found = new Map<string, RunRow>()
  for (const [flow, record] of Object.entries(held.env.description(live).flows)) {
    const stops = Array.isArray(record.stopOn) ? record.stopOn : []
    for (const [at, stop] of stops.entries()) {
      if (!isWritten(stop) || stop.event !== what.event) continue
      const arrow = held.env.arrow?.(live, flow, `stopOn.${at}`)
      const key = arrow ? keyText(arrow({ data: what.data })) : undefined
      if (key === undefined) continue
      const where = {
        all: [
          { col: 'flow', is: flow },
          { col: 'key', is: key },
          { col: 'state', in: unfinished },
        ],
      }
      for (const run of readRunRows(tx, where)) found.set(run.id, run)
    }
  }
  return [...found.values()]
}
