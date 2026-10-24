import type { Caller, Db } from '../core/index.ts'
import { TentError } from '../core/index.ts'
import type { By, FileName, Tx, Wrote, Writing } from '../data/index.ts'
import type { CallContext, Written } from './context.ts'
import { within } from './context.ts'
import { limitOf } from './limits.ts'
import type { Opened } from './opened.ts'
import { asCall, dbFor } from './program.ts'
import { byWhom } from './byWhom.ts'
import { rowHolding } from './stored/given.ts'

const system: Caller = { kind: 'system' }

/**
 * What the work of a write as the system is handed: the `db` of a change as the system, the call it stands in,
 * and `told`, by which a row that the work writes below the `db` is told as a write of the `db` is.
 */
export type SystemWork<Answer> = (db: Db, cx: CallContext, told: (w: Wrote) => void) => Answer

/**
 * Carries a piece of work out in one write that is open, as a change is carried out: a row that holds a file holds
 * it in the same write, the table triggers of the flows fire inside it, and each row is noted to be told once the
 * write is committed. With `full` the `db` has `db.system` and `db.sql`.
 */
function carried<Answer>(
  o: Opened,
  cx: CallContext,
  write: Tx | Writing,
  rows: Written['rows'],
  after: (work: () => void) => void,
  work: SystemWork<Answer>,
  full: boolean,
): Answer {
  const open: CallContext = { ...cx, ...('files' in write ? { writing: write } : { tx: write }) }
  const holds = rowHolding(o, write, system, true, after)
  const told = (w: Wrote): void => {
    holds(w)
    rows.push({ table: w.table, id: String(w.row.id), kind: w.kind })
    o.flows?.wrote(open, w)
  }
  const db = dbFor(o, system, write, { system: full, wrote: told })
  return within(open, () => work(db, open, told))
}

/**
 * Takes what the engine holds of an app, the name the work goes by, and the work. Carries it out as one write of
 * its own, as the system: see `carried`. Answers what the work answers. `by` names who the write is made by, for
 * the record of its change. A write of a tenant table that names a file which is not ready is carried out
 * again once it is.
 */
export async function systemWrite<Answer>(
  o: Opened,
  name: string,
  work: SystemWork<Answer>,
  how: { full?: boolean; by?: By } = {},
): Promise<Answer> {
  const ends = performance.now() + limitOf(o.description, 'changeTime')
  const rows: Written['rows'] = []
  const later: (() => void)[] = []
  const once = (): Answer => {
    rows.length = 0
    later.length = 0
    const made = asCall(o, system, 'write', ends)
    const cx = { ...made, work: { ...made.work, name } }
    o.machine.writes(name)
    const write = (one: Tx | Writing): Answer =>
      carried(o, cx, one, rows, (done) => void later.push(done), work, how.full === true)
    if (o.files) return o.files.write(write, how.by ? { by: how.by } : {}).value
    return o.store.write(write, how.by ? { by: how.by } : {}).value
  }
  const value = await (o.tenantFiles ? o.tenantFiles.carried(ends, once) : once())
  for (const done of later) done()
  for (const row of rows) o.raise('row.changed', { app: o.app, ...row })
  return value
}

/**
 * Takes the context of a call, what uses it, and work on a `db` that writes with full access, for a handle of the
 * engine that writes rows of the app. Carries it out in the write that is open for the call, of which it is then a
 * part, or as a write of its own as the system, made by that call. Throws T0013 in a query, in the arrow of a rule,
 * and in a call that only reads.
 */
export function systemWriteIn<Answer>(cx: CallContext, used: string, work: (db: Db) => Answer): Answer {
  const o = cx.app
  const { kind } = cx.work
  if (kind === 'query' || kind === 'rule' || cx.reads)
    throw new TentError(
      'T0013',
      `${used} writes, and was used ${cx.reads ? 'in a call that only reads' : `in a ${kind}`}.`,
      { fix: 'Write in a change, an action, a route or a step of a flow.' },
    )
  const open = cx.writing ?? cx.tx
  const written = cx.written
  if (open && written)
    return carried(
      o,
      cx,
      open,
      written.rows,
      (done) => {
        written.after = [...(written.after ?? []), done]
      },
      (db) => work(db),
      true,
    )
  const rows: Written['rows'] = []
  const later: (() => void)[] = []
  o.machine.writes(used)
  const write = (one: Tx | Writing): Answer =>
    carried(
      o,
      cx,
      one,
      rows,
      (done) => void later.push(done),
      (db) => work(db),
      true,
    )
  const by = byWhom(cx.caller, cx.run?.id)
  const { value } = o.files ? o.files.write(write, { by }) : o.store.write(write, { by })
  for (const done of later) done()
  for (const row of rows) o.raise('row.changed', { app: o.app, ...row })
  return value
}

/**
 * Takes the context of a write of the system, the file that a walk is in, and what walks. Answers the write of that
 * file: of the shared file, or of one tenant's. Throws T0009 where no write is open.
 */
export function walkedTx(cx: { tx?: Tx; writing?: Writing }, file: FileName | undefined, what: string): Tx {
  const tx = cx.writing ? cx.writing.tx(file) : cx.tx
  if (!tx) throw new TentError('T0009', `${what} was walked with no write open.`)
  return tx
}
