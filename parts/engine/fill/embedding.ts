import { TentError } from '../../core/index.ts'
import type { Opened } from '../opened.ts'
import type { FillGroup } from './columns.ts'
import { fillInputOf, fillRowIn } from './inputs.ts'
import { failedFor, isLimit, madeFor } from './making.ts'
import type { FillPlace } from './places.ts'

/** One value that is to be made: its row, the file it stands in, and how often it was tried. */
export interface ToMake {
  place: FillPlace
  rowId: string
  tries: number
}

/**
 * Takes an app, the group of a vector column whose model turns columns into it, and the rows to make, as many as
 * its `batch` at the most. Hands the words of each row, its columns joined by a line feed, to one `embed` of the
 * model, as the system under the starter of the column, and writes each vector by the rule of every fill. A limit
 * of use that refused the call leaves every row due and counts no try: the answer is `limited`.
 */
export async function makeEmbeds(o: Opened, group: FillGroup, rows: ToMake[]): Promise<'limited' | undefined> {
  const found = rows.flatMap((one) => {
    const row = fillRowIn(one.place.store, group.table, one.rowId)
    return row ? [{ ...one, handed: fillInputOf(o, one.place.store, group, row) }] : []
  })
  if (!found.length) return undefined
  const texts = found.map((one) =>
    Object.keys(group.input)
      .map((column) => one.handed.input[column])
      .filter((value) => value !== undefined)
      .map(String)
      .join('\n'),
  )
  const [first] = group.columns
  const caller = { kind: 'system' as const, ...(first ? { starter: `fill:${first.table}.${first.column}` } : {}) }
  let vectors: unknown
  try {
    const { appModelCall } = await import('../ai/appCall.ts')
    vectors = await appModelCall(o, `${group.work}.embed`, [texts], caller)
    if (!Array.isArray(vectors) || vectors.length !== texts.length)
      throw new TentError('T0009', `The model ${group.work} answered no vector for each of ${texts.length} texts.`)
  } catch (error) {
    if (isLimit(group, error)) return 'limited'
    for (const one of found) failedFor(o, group, one.place, one.rowId, one.handed, one.tries, error)
    return undefined
  }
  const made: unknown[] = vectors
  for (const [i, one] of found.entries())
    madeFor(
      o,
      group,
      one.place,
      one.rowId,
      one.handed,
      Object.fromEntries(group.columns.map((column) => [column.column, made[i]])),
    )
  return undefined
}
