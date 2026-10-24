import { TentError } from '../../core/index.ts'
import type { Opened } from '../opened.ts'
import { carryFill } from './carry.ts'
import type { FillGroup } from './columns.ts'
import { fillInputOf, fillRowIn } from './inputs.ts'
import { setFilled } from './marks.ts'
import { workPrint } from './notes.ts'
import type { FillPlace } from './places.ts'
import { writeAt } from './places.ts'

// The first wait between two tries of the work of one row, as a flow's tries have it: each wait six times the one before.
const firstWait = 5000

/** What a row of `_t_filled` keeps of an error: what a caller would see of it. */
function keptError(error: unknown): Record<string, unknown> {
  if (error instanceof TentError) return { code: error.code, name: error.name, message: error.message }
  return { code: 'T0009', name: 'internal', message: error instanceof Error ? error.message : String(error) }
}

/** Whether what the work failed with is a limit of use that holds it back, which is no error of the work. */
export const isLimit = (group: FillGroup, error: unknown): boolean =>
  error instanceof TentError && error.code === 'T7102' && group.atLimit !== 'fail'

/** What the work of a row was handed, and the fingerprint of that. */
export type Handed = ReturnType<typeof fillInputOf>

/**
 * Writes the values that the work made for a row, in one write with their rows of `_t_filled`, only where what the
 * work would be handed now still has the fingerprint it was handed: where the row changed meanwhile the answer is
 * dropped and the row stays due, and where it is gone nothing is written.
 */
export function madeFor(
  o: Opened,
  group: FillGroup,
  place: FillPlace,
  rowId: string,
  handed: Handed,
  values: object,
): void {
  writeAt(o, place, (tx) => {
    const now = fillRowIn(tx, group.table, rowId)
    if (!now || fillInputOf(o, tx, group, now).read !== handed.read) return
    // A fill leaves `updatedAt` alone: it is the time of what the app wrote.
    tx.change(group.table, rowId, { ...values, updatedAt: now.updatedAt }, { kind: 'system' })
    const madeAt = new Date(o.clock.now())
    for (const one of group.columns)
      setFilled(tx, group.table, rowId, one.column, {
        state: 'made',
        read: handed.read,
        work: workPrint(o, group, one),
        madeAt,
        tries: 0,
        error: null,
        dueAt: null,
      })
    // Only a flow whose trigger names a filled column is started by the fill.
    o.flows?.runner.fired(tx, {
      table: group.table,
      kind: 'changed',
      row: { ...now, ...values },
      before: now,
      columns: group.columns.map((one) => one.column),
      filled: true,
      ...(place.file ? { file: place.file } : {}),
    })
  })
}

/**
 * Writes that the work of a row failed: it counts a try, and after `tries` the values are `failed`, with the
 * error, and are left alone until their row is marked again.
 */
export function failedFor(
  o: Opened,
  group: FillGroup,
  place: FillPlace,
  rowId: string,
  handed: Handed,
  tries: number,
  error: unknown,
): void {
  const failed = tries + 1
  const now = o.clock.now()
  writeAt(o, place, (tx) => {
    if (!fillRowIn(tx, group.table, rowId)) return
    for (const one of group.columns)
      setFilled(
        tx,
        group.table,
        rowId,
        one.column,
        failed >= group.tries
          ? { state: 'failed', tries: failed, error: keptError(error), read: handed.read }
          : {
              state: 'due',
              tries: failed,
              error: keptError(error),
              dueAt: new Date(now + firstWait * 6 ** (failed - 1)),
            },
      )
  })
}

/**
 * Takes an app, a fill group, the file of a row, its id and how often its work was tried. Carries the work out
 * for the row as it is now and writes what came of it. A limit of use that refused the work leaves the row due and
 * counts no try: the answer is `limited`, and the pass takes the group up again later.
 */
export async function makeOne(
  o: Opened,
  group: FillGroup,
  place: FillPlace,
  rowId: string,
  tries: number,
): Promise<'limited' | undefined> {
  const row = fillRowIn(place.store, group.table, rowId)
  if (!row) return undefined
  const handed = fillInputOf(o, place.store, group, row)
  let values: Record<string, unknown>
  try {
    values = await carryFill(o, group, rowId, handed, tries)
  } catch (error) {
    if (isLimit(group, error)) return 'limited'
    failedFor(o, group, place, rowId, handed, tries, error)
    return undefined
  }
  madeFor(o, group, place, rowId, handed, values)
  return undefined
}
