import { isDeepStrictEqual } from 'node:util'
import { TentError } from '../../core/index.ts'
import type { Misfit, TableLayout, TableStep } from '../../data/index.ts'
import {
  applySteps,
  filledBy,
  layoutOf,
  planTableChanges,
  setCheck,
  setRunningVersion,
  waitsForBackfill,
} from '../../data/index.ts'
import { backupsOf, takeBackup } from '../backups.ts'
import type { Opened } from '../opened.ts'
import { sealedAt } from '../values/seal.ts'
import { checkAll, unholdAll } from './checking.ts'
import type { TenantFiles } from './face.ts'
import { metaOf } from '../held.ts'
import {
  addAgain,
  countMove,
  emptied,
  holdsMoved,
  leaveFiles,
  moveRows,
  movesOf,
  noteMove,
  undoMove,
} from './moving.ts'
import { planTenantFiles } from './opening.ts'
import { behindCount, passOver } from './pass.ts'
import { turnsBack } from './raising.ts'

/** What a switch over the files of tenants did. */
export interface SwitchedTenantFiles {
  // The steps of the shared file, and those that each file is brought up by.
  steps: TableStep[]
  // The count of files that are behind: the count that the pass began with, for a switch that was taken.
  behind: number
  refused?: 'behind'
  taken: boolean
  // Rows were moved from one way to the other, or with `dry` would be.
  moved: boolean
  // The steps of the shared file that make a column required which a backfill fills, taken once it ran.
  later?: TableStep[]
}

const isLayouts = (held: unknown): held is TableLayout[] =>
  Array.isArray(held) && held.every((one) => typeof Reflect.get(Object(one), 'name') === 'string')

// The layout of the tenant tables that the last switch came from, for each app, with the steps that its pass
// brings each file up by: a switch to that layout is a switch back, which is taken also while the pass has not
// ended, and brings each file back by those steps turned round. An app that opens ends its pass first, so this is
// kept in memory alone.
const cameFrom = new WeakMap<TenantFiles, { layout: unknown; steps: TableStep[] }>()

// The apps whose pass turns round: until every file is back, no other switch that changes a tenant table is
// taken, since the holds of the version that was left are still being taken away.
const turning = new WeakSet<TenantFiles>()

/** The finding of the rows of one file that do not fit a step, with the tenant and the count. */
function refusal({ table, column, rows, file }: Misfit): TentError {
  const count = rows === 1 ? '1 row' : `${rows} rows`
  const where = file ? `, in the data file of ${file.table} ${file.id}` : ''
  return new TentError(
    'T2001',
    `${count} of \`${table}\` ${rows === 1 ? 'does' : 'do'} not fit what \`${table}.${column}\` becomes${where}.`,
    { fix: 'Change those rows so that they fit, or add a new column, fill it with a change, then remove the old one.' },
  )
}

/** Starts a pass beside the app, and says in the log where it ends early. */
const beside = (o: Opened, tenantFiles: TenantFiles, work: () => Promise<unknown>): void =>
  void work().catch((error: unknown) => {
    if (!o.closed)
      tenantFiles.line('error', 'The pass over the data files of tenants ended early.', { error: String(error) })
  })

/**
 * Takes what the engine holds of an app that keeps a data file for each tenant, its files, the app as the version
 * to switch to serves it, and the id of that version. Makes the switch over the files.
 *
 * A switch that changes a tenant table is not taken while a file is still behind the running layout or
 * failed: it answers `refused: 'behind'` with the count. But a switch back to the layout that the last switch
 * came from is taken at once, with no check, whether its pass still runs or has ended: the pass turns round, and
 * each file that it had brought up goes back by the steps it came by. While that pass back runs, any switch that changes a tenant table is refused in the
 * same way, a switch forward again among them.
 *
 * With `move`, where a table gains or loses `tenant`, its rows are first added where they go, with every write of
 * such a table held meanwhile: see `moveRows`. Whatever refuses the switch after that undoes the move.
 *
 * Then the shared file names the check that stands, and every file that holds a table of the steps is held
 * against them on a file thread: a file that fits is held to the steps from then on, by every version. One file
 * that does not fit takes the check away, with its holds, and throws T2001, naming the tenant and the count.
 * Then the shared file takes its steps, the running layout of the files and the version in one write, which
 * takes the check away and ends the move, and the pass that brings every file up is started. With `dry` the
 * misfits are counted to read alone, nothing is held, and nothing is changed.
 */
export async function switchTenantFiles(
  o: Opened,
  tenantFiles: TenantFiles,
  served: Opened,
  version: string,
  how: { dry: boolean; move: boolean; backup?: boolean },
): Promise<SwitchedTenantFiles> {
  const to = served.description
  const named: unknown = metaOf(o.store, 'tenantLayout')
  const layout = layoutOf(to)
  const tenantTablesNow = layout.filter((one) => one.tenant !== undefined)
  const asked: unknown = JSON.parse(JSON.stringify(tenantTablesNow))
  const changes = !isDeepStrictEqual(named, asked)
  // One switch at a time: no file is more than one layout behind by a switch.
  const waiting = behindCount(tenantFiles)
  const came = turning.has(tenantFiles) ? undefined : cameFrom.get(tenantFiles)
  // Whether the pass of the last switch still runs or has just ended makes no difference to what going back needs,
  // and nothing but a moment tells the two apart: the layout that the last switch came from is gone back to.
  const back = changes && came !== undefined && isDeepStrictEqual(came.layout, asked)
  if (changes && (waiting > 0 || turning.has(tenantFiles)) && !back)
    return { steps: [], behind: waiting, refused: 'behind', taken: false, moved: false }
  const from = layoutOf(o.description)
  const moves = how.move ? movesOf(from, layout) : []
  if (how.dry) {
    // What does not fit is counted with nothing held: every file is read, and none is written.
    if (moves.length) await countMove(o, tenantFiles, moves, layout)
    const planned = await planTenantFiles(o, tenantFiles, to, moves.length > 0, moves.length > 0)
    return { steps: planned.steps, behind: waiting, taken: false, moved: moves.length > 0 }
  }
  const moving = moves.length ? await moveRows(o, tenantFiles, moves, version, from, layout) : undefined
  const leaves = moves.some((one) => one.way === 'out')
  let written = false
  try {
    const all = await planTenantFiles(o, tenantFiles, to, true, moves.length > 0)
    // A column that a backfill fills is required once the backfill ran: that step waits for it.
    const fills = filledBy(to)
    const later = all.steps.filter((step) => waitsForBackfill(step, fills))
    const planned = { ...all, steps: all.steps.filter((step) => !waitsForBackfill(step, fills)) }
    const stated = to.project.removed
    // A table that moves out of the files leaves them as one that was removed by a statement.
    const removed = [
      ...(Array.isArray(stated) ? stated.map(String) : []),
      ...moves.filter((one) => one.way === 'out').map((one) => one.table),
    ]
    // A file that goes back is brought to a layout it held: its steps are those of `back`, and nothing is checked.
    const ofFiles =
      changes && !back && isLayouts(named) ? planTableChanges(named, tenantTablesNow, { removed }) : undefined
    const [found] = ofFiles?.findings ?? []
    if (found) throw new TentError(found.code, found.message, found.fix === undefined ? {} : { fix: found.fix })
    const steps = ofFiles?.steps ?? []
    // A file is held to a column that a backfill fills once the backfill ran in it, as it is brought up.
    const checked = steps.filter((step) => !waitsForBackfill(step, fills))
    // What a table change could lose is kept first, as an opening keeps it: a backup of the data, which holds the
    // file of each tenant. The steps of the files count as those of the shared file do.
    const changed = (planned.steps.length > 0 && planned.held) || steps.length > 0 || how.backup === true
    if (changed && backupsOf(to).beforeChanges) await takeBackup(o)
    const left = o.version
    if (checked.length) {
      // The check stands before the first file is held, so that a hold counts from the write that makes it.
      o.store.write((tx) => setCheck(tx, { version, steps: checked }))
      // A file holds the tenant tables whose tenants are of its table: the table that their `tenant` column links to.
      const tenantOf = (one: TableLayout): string[] => {
        const type = one.tenant === undefined ? undefined : one.columns[one.tenant]
        return type?.kind === 'link' ? [type.table] : []
      }
      const known = [...tenantTablesNow, ...(isLayouts(named) ? named : [])]
      const tables = new Set(
        checked.flatMap((step) => known.filter((one) => one.name === step.table).flatMap(tenantOf)),
      )
      let misfit: Misfit | undefined
      try {
        misfit = await checkAll(o, tenantFiles, checked, version, tables)
      } catch (error) {
        if (!o.closed) {
          o.store.write((tx) => setCheck(tx, undefined))
          beside(o, tenantFiles, () => unholdAll(o, tenantFiles, version))
        }
        throw error
      }
      if (misfit) {
        // No hold outlives its check: it counts no more from this write on, and a pass takes it out of every file.
        o.store.write((tx) => setCheck(tx, undefined))
        beside(o, tenantFiles, () => unholdAll(o, tenantFiles, version))
        throw refusal(misfit)
      }
    }
    // A raw text that states no table may have written a table that moves since its rows were added: they are
    // added anew then, and no such text is taken from here until the write below.
    if (moving && tenantFiles.settle()) await addAgain(o, tenantFiles, moving.note)
    tenantFiles.own(() =>
      o.store.write(
        (tx) => {
          if (planned.steps.length) applySteps(tx, o.store, planned.steps, sealedAt(o.dataFolder))
          // A table that gained `tenant` leaves the shared file in the write that ends its move, its holds with it.
          holdsMoved(tx, moves, layout)
          for (const { table, way } of moves) if (way === 'in') emptied(tx, table)
          // The files that rows still leave are told the layout once the rows have left them.
          if (!leaves) tenantFiles.files.layout(layout)
          setRunningVersion(tx, version)
          setCheck(tx, undefined)
          if (moving) noteMove(tx, leaves ? { ...moving.note, ended: true } : undefined)
        },
        { steps: true },
      ),
    )
    written = true
    const waits = later.length ? { later } : {}
    if (!back) cameFrom.set(tenantFiles, { layout: named, steps })
    if (leaves && moving) {
      const { note } = moving
      beside(o, tenantFiles, async () => {
        await leaveFiles(o, tenantFiles, note)
        await passOver(o, tenantFiles)
      })
      return {
        steps: [...planned.steps, ...steps],
        behind: behindCount(tenantFiles),
        taken: true,
        moved: true,
        ...waits,
      }
    }
    tenantFiles.follow(layout)
    if (!back) {
      const behind = behindCount(tenantFiles)
      beside(o, tenantFiles, () => passOver(o, tenantFiles))
      return { steps: [...planned.steps, ...steps], behind, taken: true, moved: moves.length > 0, ...waits }
    }
    // The pass turns round. A file that was not brought up yet keeps its fingerprint and loses its holds, which
    // are those of the version that is left. The others are brought back, once the work under way on them has ended.
    const turned = came?.steps ?? []
    cameFrom.delete(tenantFiles)
    turning.add(tenantFiles)
    turnsBack(tenantFiles.files, turned)
    beside(o, tenantFiles, async () => {
      try {
        await tenantFiles.idle()
        await unholdAll(o, tenantFiles, left)
        await passOver(o, tenantFiles, undefined, turned)
      } finally {
        turning.delete(tenantFiles)
        turnsBack(tenantFiles.files, undefined)
      }
    })
    return { steps: planned.steps, behind: behindCount(tenantFiles), taken: true, moved: false, ...waits }
  } catch (error) {
    // Whatever refuses the switch after its rows were added undoes the move: every row is where it was.
    if (moving && !written && !o.closed) await undoMove(o, tenantFiles, moving.note)
    throw error
  } finally {
    moving?.release()
  }
}
