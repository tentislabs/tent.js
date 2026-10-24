import { TentError } from '../core/index.ts'
import { stepsThenRows } from './applySteps.ts'
import type { Change } from './changes.ts'
import { cleanSteps } from './cleanSteps.ts'
import type { Seal } from './context.ts'
import { tenantTable, inFiles, layoutFingerprint } from './fileLayout.ts'
import { findMisfits } from './findMisfits.ts'
import { setMeta } from './here.ts'
import { heldMeta } from './metaKeys.ts'
import type { OnThread } from './onThread.ts'
import { fileWrite } from './onThread.ts'
import { planTableChanges } from './planTableChanges.ts'
import type { Store, TableLayout, TableStep } from './store.ts'
import { underNewNames } from './underNewNames.ts'
import { wasOf } from './wasOf.ts'

/**
 * What an older layout does not know of a table is retired with no statement: going back drops nothing. A column
 * that the older layout holds under the name it had before is no such column: it takes that name again.
 */
function knowing(asked: TableLayout, held: TableLayout | undefined): TableLayout {
  const renamed = new Set(Object.values(asked.columns).flatMap((type) => wasOf(type)))
  const gone = Object.keys(held?.columns ?? {}).filter(
    (name) => !Object.hasOwn(asked.columns, name) && !renamed.has(name),
  )
  return gone.length ? { ...asked, removed: [...(asked.removed ?? []), ...gone] } : asked
}

/**
 * Takes the layout that a file goes back to, and the steps by which it was brought up from it. Answers that layout
 * with each rename of those steps turned round: a column and a table that a step renamed state the newer name as
 * the one they had, so that each takes its old name again with its values.
 */
function turnedRound(to: TableLayout[], steps: TableStep[]): TableLayout[] {
  // A table that was renamed is named in the steps by its newer name: its older one is what the layout holds.
  const older = new Map(steps.filter((step) => step.do === 'renameTable').map((step) => [step.table, step.from]))
  return to.map((table) => {
    const newer = [...older].filter(([, from]) => from === table.name).map(([now]) => now)
    const columns = { ...table.columns }
    for (const step of steps) {
      if (step.do !== 'renameColumn' || step.column === undefined || step.from === undefined) continue
      if ((older.get(step.table) ?? step.table) !== table.name || !Object.hasOwn(columns, step.from)) continue
      const type = columns[step.from]
      columns[step.from] = Object.assign({}, type, { was: [...wasOf(type), step.column] })
    }
    return { ...table, columns, ...(newer.length ? { was: [...(table.was ?? []), ...newer] } : {}) }
  })
}

/** The words of a count of rows. */
export const rowsText = (n: number): string => (n === 1 ? '1 row' : `${n} rows`)

/**
 * Takes the store of one tenant's file and the layout of the app that the file is brought to. In one write, for
 * the tables that file holds, it carries out the table changes from what the store answers as its layout to that
 * layout, by the tested routines, writes the fingerprint of the layout into the file, and takes its holds away. A
 * table that the file does not hold needs no change: it is made in the running layout with its first row. With
 * `back` what the layout does not know is retired with no statement, and with `turned`, the steps by which the
 * file was brought up from that layout, each rename of them is turned round: the file goes back by the steps it
 * came by. With `clean` the file also drops what it holds retired, and with a `Seal` the rows of a column that
 * gains or loses `sealed` are sealed and opened. Without `thread` the write is one of the store it is handed, and
 * nothing is answered; with it, the change of a file thread. Throws the first finding of a change that is never
 * applied by itself, and T2001 where rows of the file do not fit a step, with the tenant and the count: nothing is
 * written then.
 */
export function bringUp(
  store: Store,
  to: TableLayout[],
  o: { back?: boolean; turned?: TableStep[]; clean?: boolean; seal?: Seal; thread?: OnThread } = {},
): Change | undefined {
  // The layout that the steps are planned to: the one the file is brought to, with what a way back turns round.
  const plan = o.back && o.turned?.length ? turnedRound(to, o.turned) : to
  // A rename of a table of the shared file moves no file: the file takes the new name here.
  const {
    renamed,
    held,
    steps: relinked,
  } = underNewNames(
    store.layout().filter((one) => !one.name.startsWith('_t_')),
    plan,
  )
  const stood = String(heldMeta(store, 'table'))
  const table = renamed.get(stood) ?? stood
  const byName = new Map(held.map((one) => [one.name, one]))
  const before = (asked: TableLayout): TableLayout | undefined =>
    byName.get(asked.name) ?? (asked.was ?? []).map((name) => byName.get(name)).find((one) => one !== undefined)
  // The tables that the file holds, as the layout asks for them in a file.
  const asked = inFiles(plan)
    .filter((one) => tenantTable(one) === table && before(one) !== undefined)
    .map((one) => (o.back ? knowing(one, before(one)) : one))
  // A table that the layout no longer keeps in this file was removed by a statement of the project, or by going back.
  const removed = held.filter((one) => !asked.some((other) => before(other) === one)).map((one) => one.name)
  const planned = planTableChanges(held, asked, { removed })
  const steps = [...relinked, ...planned.steps]
  const [found] = planned.findings
  if (found) throw new TentError(found.code, found.message, found.fix === undefined ? {} : { fix: found.fix })
  const [misfit] = findMisfits(store, steps)
  if (misfit)
    throw new TentError(
      'T2001',
      `${rowsText(misfit.rows)} of \`${misfit.table}\` ${misfit.rows === 1 ? 'does' : 'do'} not fit what \`${misfit.table}.${misfit.column}\` becomes, in the data file of ${table} ${String(heldMeta(store, 'tenant'))}.`,
      { fix: 'Change those rows so that they fit, and bring the file up again: `tent data files --retry`.' },
    )
  return fileWrite(store, { ...(o.thread ? { thread: o.thread } : {}), steps: true }, (tx, stepping) => {
    stepsThenRows(tx, stepping, steps, o.seal ? { seal: o.seal } : {}, () => {
      const drops = o.clean ? cleanSteps(stepping.layout().filter((one) => !one.name.startsWith('_t_'))) : []
      if (drops.length) stepping.applyTableChanges(drops)
    })
    if (table !== stood) setMeta(tx, 'table', table)
    setMeta(tx, 'fingerprint', layoutFingerprint(to, table))
    setMeta(tx, 'holds', undefined)
    return true
  })
}
