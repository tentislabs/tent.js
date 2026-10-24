import { isStored } from '../core/internal.ts'
import { setMeta } from './here.ts'
import { rowIds } from './ids.ts'
import { mustBeHeld, takesLess } from './keptType.ts'
import type { ColumnType, Store, TableLayout, TableStep, Tx } from './store.ts'
import { metaTable } from './tables.ts'

const system = { kind: 'system' } as const

/** Answers the value that `_t_meta` holds under a key, by a store or by the write to work in. */
export function heldMeta(on: Store | Tx, key: string): unknown {
  const plan = { from: metaTable.name, one: 'get' as const, id: key }
  const row: unknown = 'write' in on ? on.read(plan, system).value : on.read(plan, system)
  return typeof row === 'object' && row !== null && 'value' in row ? row.value : undefined
}

/** What the shared file keeps of its removals of rows that a tenant table links to: a mark, and a count. */
function removalsIn(shared: Store | Tx): { mark: string; count: number } {
  const held = heldMeta(shared, 'removals')
  const [mark, count] = isStored(held) ? [held.mark, held.count] : []
  return { mark: typeof mark === 'string' ? mark : '0', count: typeof count === 'number' ? count : 0 }
}

/** Answers the count of removals that the shared file tells, as `<mark>.<count>`: a file is swept where it stands at another. */
export function toldCount(shared: Store | Tx): string {
  const { mark, count } = removalsIn(shared)
  return `${mark}.${count}`
}

/** Raises the count of removals, inside the write of the shared file that removes a row which a file may link to. */
export function raiseRemovals(tx: Tx): void {
  const { mark, count } = removalsIn(tx)
  setMeta(tx, 'removals', { mark: mark === '0' ? rowIds.next() : mark, count: count + 1 })
}

/** Makes the mark of the count anew, inside a write of the shared file: every file is then swept when it is next opened. */
export function newMark(tx: Tx): void {
  setMeta(tx, 'removals', { mark: rowIds.next(), count: removalsIn(tx).count })
}

/** Whether the shared file keeps a count of removals: it does once a row was removed that a file may link to. */
export const countsRemovals = (shared: Store | Tx): boolean => heldMeta(shared, 'removals') !== undefined

/** One step that a file is held to before the switch that brings it: every write of the file is held to it. */
export interface Hold {
  version: string
  step: TableStep
}

const isStep = (value: unknown): value is TableStep =>
  isStored(value) && typeof value.do === 'string' && typeof value.table === 'string'

/** Answers the check that stands, as the shared file names it: its version and its steps. Nothing where none stands. */
export function standingCheck(shared: Store | Tx): { version: string; steps: TableStep[] } | undefined {
  const held = heldMeta(shared, 'check')
  if (!isStored(held) || typeof held.version !== 'string' || !Array.isArray(held.steps)) return undefined
  return { version: held.version, steps: held.steps.filter(isStep) }
}

/**
 * Takes a write of the shared file, and the check that stands from now on: its version and the steps that every
 * file is held to before the switch. Writes it inside that write, or takes it away where it is handed nothing.
 * There is one check at a time, so one that stood is replaced.
 */
export function setCheck(tx: Tx, check: { version: string; steps: TableStep[] } | undefined): void {
  setMeta(tx, 'check', check)
}

/**
 * Takes a write of the shared file and the version that runs from now on. Writes it inside that write: a hold of
 * a file counts while its version is this one, or that of the check that stands.
 */
export function setRunningVersion(tx: Tx, version: string): void {
  setMeta(tx, 'version', version)
}

/** Answers the holds that a file keeps. */
export function holdsIn(file: Store | Tx): Hold[] {
  const held = heldMeta(file, 'holds')
  return (Array.isArray(held) ? held : []).filter(
    (one): one is Hold => isStored(one) && typeof one.version === 'string' && isStep(one.step),
  )
}

/** Answers the versions whose holds count: that of the check that stands, and the running one. */
export function countingVersions(shared: Store | Tx): string[] {
  const running = heldMeta(shared, 'version')
  return [standingCheck(shared)?.version, typeof running === 'string' ? running : undefined].filter(
    (one) => one !== undefined,
  )
}

/**
 * Takes a step of a table change and the layout its table has. Answers whether the step is checked against the
 * rows, so that a file is held to it: a column that must hold a value from now on, a new `unique` rule, and a
 * change of type that takes less than the type the layout holds.
 */
export function isChecked(step: TableStep, layout: TableLayout | undefined): boolean {
  if (step.do === 'require' || step.do === 'addUnique') return true
  const held: ColumnType | undefined = step.column === undefined ? undefined : layout?.columns[step.column]
  if (step.do !== 'retype' || !step.to || !held || step.to.kind === 'vector') return false
  return (mustBeHeld(step.to) && !mustBeHeld(held)) || takesLess(held, step.to)
}
