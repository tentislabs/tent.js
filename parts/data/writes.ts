import { isDeepStrictEqual } from 'node:util'
import type { Type } from '../core/index.ts'
import { TentError } from '../core/index.ts'
import { checkValue, projectZone } from '../core/internal.ts'
import type { DbContext } from './context.ts'
import { begin, boundOf, noKey } from './context.ts'
import { countedRow } from './counting.ts'
import { fingerprintOf, foundColumn } from './found.ts'
import { momentDefault } from './defaults.ts'
import { fitsNone, within } from './fileReads.ts'
import { fitsInMemory } from './fitsInMemory.ts'
import type { WriteFile } from './fileWrites.ts'
import { heldTenant, heldSteps, sameTenant, sharedLinks, writeFile } from './fileWrites.ts'
import { raiseRemovals } from './metaKeys.ts'
import { keepVersion } from './history.ts'
import { rowIds } from './ids.ts'
import { mustBeHeld } from './keptType.ts'
import type { TableModel } from './model.ts'
import { tableOf } from './model.ts'
import { handedRow, shown } from './present.ts'
import { vectorOf } from './vector.ts'
import { rulingOf } from './reads.ts'
import { rowUnder } from './rowUnder.ts'
import type { Ruled } from './rules.ts'
import { ruled, ruleResolve } from './rules.ts'
import type { Row, Tx } from './store.ts'
import { workedValue } from './worked.ts'
import { shownWrite } from './shown.ts'

type What = 'add' | 'change' | 'remove'

const misfit = (model: TableModel, column: string, check: string, words: string): TentError =>
  new TentError('T2107', `\`${column}\` of \`${model.name}\` ${words}.`, { fields: { [column]: check } })

/**
 * The write of this `db`, in the file it is at work in, or T0012 for a `db` that only reads. The write of the
 * files of tenants is opened by its first asking, so it is asked for when a row is about to be written.
 */
function writeOf(cx: DbContext): Tx {
  if (cx.mode !== 'write' || !cx.write)
    throw new TentError('T0012', 'A write was tried through a db that only reads.', {
      fix: 'Write inside a change. An action and a step of a flow call a change.',
    })
  return cx.write(cx.at)
}

/** Holds that this `db` writes, with no write opened. */
function mayWrite(cx: DbContext): void {
  if (cx.mode !== 'write' || !cx.write) writeOf(cx)
}

/** A rule as it stands for the tenant of a write: one that already fits no row of that tenant reaches none. */
function forTenant(model: TableModel, rule: Ruled, file: WriteFile): Ruled {
  if (!model.tenant || !file.at || rule.reach === 'all' || rule.reach === 'none') return rule
  return fitsNone(rule.reach, model.tenant, file.at.id) ? { ...rule, reach: 'none' } : rule
}

/** Tells that a rule refused a write, and answers the error for it. */
function denied(cx: DbContext, model: TableModel, what: What, rule: Ruled): TentError {
  cx.o.noted?.({ kind: 'refused', table: model.name, what, rule: rule.rule })
  return new TentError('T3101', rule.why)
}

/** What a rule lets this `db` reach of a table: everything where no rule limits it. */
const reachOf = (cx: DbContext, model: TableModel, what: What | 'read'): Ruled =>
  cx.full ? { reach: 'all', rule: 'system', why: '' } : ruled(rulingOf(cx), model, what)

/** Holds the names that a write gives against the table: a column it has, that code may write, and that is not guarded. */
function named(cx: DbContext, model: TableModel, what: What, values: Row): [string, unknown][] {
  const given = Object.entries(values).filter(([, value]) => value !== undefined)
  const guarded = cx.full ? [] : (cx.o.guarded?.[model.name] ?? [])
  for (const [name, value] of given) {
    if (!Object.hasOwn(model.columns, name)) throw misfit(model, name, 'unknown', 'is no column that a write may name')
    if (model.worked.includes(name))
      throw misfit(model, name, 'from', 'is worked out from other columns, and cannot be written')
    if (model.kept.includes(name))
      throw misfit(
        model,
        name,
        'kept',
        'is kept by the engine from the rows that link to its row, and cannot be written',
      )
    // A change of a guarded column is refused whatever value it gives, and an add that gives one.
    if (guarded.includes(name) && (what === 'change' || value !== null)) {
      cx.o.noted?.({ kind: 'refused', table: model.name, what, rule: 'guarded' })
      throw new TentError('T3101', `${model.name}.${what} may not write \`${name}\`: only code with full access does.`)
    }
  }
  return given
}

/** Holds one value against the type of its column. Throws T2107, which names the column and the place inside it. */
function fits(model: TableModel, column: string, type: Type, value: unknown): void {
  // A vector is held to its size and to finite numbers, with a code of its own.
  if (type.kind === 'vector') {
    vectorOf(value, type.size, model.name, column)
    return
  }
  const found = checkValue(type, value)
  if (!found.length) return
  const fields = Object.fromEntries(
    found
      .flatMap((one) => Object.entries(one.fields ?? {}))
      .map(([name, check]) => [name ? `${column}.${name}` : column, check]),
  )
  throw new TentError(
    'T2107',
    `The value of \`${column}\` does not fit its column of \`${model.name}\`: ${found[0].message}`,
    { fields },
  )
}

/** The value that a column has where a new row gives none: its default, or nothing. */
function defaultOf(cx: DbContext, model: TableModel, column: string, type: Type, at: number): unknown {
  // On `users` the roles count as having the default of an empty list.
  if (model.name === 'users' && column === 'roles') return []
  if (!('default' in type) || type.default === undefined) return undefined
  return (
    momentDefault(type, at, projectZone(cx.description.project)) ?? workedValue(type.default, ruleResolve(cx.caller))
  )
}

/**
 * Seals the values of the sealed columns that a write gives, bound to the row, and keeps beside each one that is
 * found its fingerprint. Throws T0019 with no key at hand.
 */
function sealedIn(cx: DbContext, model: TableModel, values: Row, id: string): void {
  for (const column of model.findable)
    if (values[column] !== undefined)
      values[foundColumn(column)] = values[column] === null ? null : fingerprintOf(cx, model, column, values[column])
  for (const column of model.sealed) {
    if (values[column] === undefined || values[column] === null) continue
    if (!cx.o.seal) throw noKey(model.name, column)
    values[column] = cx.o.seal.close(values[column], boundOf(model.name, column, id))
  }
}

/** Moves each kept number that counts a row which was written, in the same write, and tells each row it changed. */
function counted(cx: DbContext, tx: Tx, model: TableModel, before: Row | undefined, after: Row | undefined): void {
  if (!model.counted.length) return
  for (const done of countedRow(tx, model.counted, before, after)) cx.o.wrote?.(done)
}

/** A row that a write answers, as the code of this `db` sees it. */
const answered = (cx: DbContext, model: TableModel, row: Row): Row => handedRow(cx, model, shown(cx, model, { ...row }))

/**
 * Adds a row, as `add` of a table of `db` does. `of` is the tenant whose file the row lives in, for a tenant
 * table: the rule comes first, and a file is made only by a write that has passed it.
 */
export function addRow(cx: DbContext, table: string, written: Row, of?: unknown): Row {
  mayWrite(cx)
  const at = begin(cx)
  const model = tableOf(cx.description, table)
  shownWrite(model)
  const file = writeFile(cx, model, of)
  return within(cx, file.at, () => {
    const rule = forTenant(model, reachOf(cx, model, 'add'), file)
    if (rule.reach === 'none') throw denied(cx, model, 'add', rule)
    heldTenant(cx, model, file)
    const values: Row = {}
    for (const [name, value] of named(cx, model, 'add', written)) if (value !== null) values[name] = value
    // The row of a tenant table holds its tenant: the one that `of` names, and no other.
    if (model.tenant && file.at) {
      sameTenant(model, values, file.at.id)
      values[model.tenant] = file.at.id
    }
    // The owner of a new row is the caller, where the row names none.
    if (model.owner && values[model.owner] === undefined && cx.caller.user) values[model.owner] = cx.caller.user.id
    for (const [column, type] of Object.entries(model.columns)) {
      if (model.worked.includes(column)) continue
      if (values[column] === undefined) values[column] = defaultOf(cx, model, column, type, at)
      if (values[column] !== undefined) fits(model, column, type, values[column])
      else if (mustBeHeld(type)) throw misfit(model, column, 'required', 'is required and was not given')
    }
    if (file.at) {
      heldSteps(cx, file.at, model, values, true)
      sharedLinks(cx, model, values)
    }
    const id = rowIds.next()
    // Opening the write of a tenant with no file makes the file, and a file is made only by a write that has
    // passed its rule: for such a tenant the rule is asked of the row first, in memory.
    const unmade = file.at !== undefined && cx.files?.has(file.at) === false
    if (unmade && rule.reach !== 'all') {
      const row = { ...values, id, createdAt: new Date(at) }
      if (!fitsInMemory(cx, model, rule.reach, row)) throw denied(cx, model, 'add', rule)
    }
    sealedIn(cx, model, values, id)
    const tx = writeOf(cx)
    const row = tx.add(table, { ...values, id, createdAt: new Date(at) }, cx.caller)
    // A rule that is a filter is asked of the row as it now stands, in one question. A row that does not fit is taken out again.
    if (rule.reach !== 'all' && !rowUnder(cx, model, id, rule.reach)) {
      tx.remove(table, id, cx.caller)
      throw denied(cx, model, 'add', rule)
    }
    cx.o.wrote?.({ table, kind: 'added', row })
    counted(cx, tx, model, undefined, row)
    return answered(cx, model, row)
  })
}

/**
 * Finds the row that a change or a removal names, with the rule as a filter. A row that is not there, or that the
 * caller may not read, is T2103. One they may read and may not touch is T3101.
 */
function found(cx: DbContext, model: TableModel, what: What, id: string, file: WriteFile): Row {
  const missing = () =>
    new TentError('T2103', `No row of \`${model.name}\` is found under the id ${JSON.stringify(id)}.`)
  const rule = forTenant(model, reachOf(cx, model, what), file)
  // A caller whose rule reaches nothing of that tenant opens no file, and learns nothing of the tenant.
  if (file.at && rule.reach === 'none' && forTenant(model, reachOf(cx, model, 'read'), file).reach === 'none')
    throw missing()
  heldTenant(cx, model, file)
  const row = rowUnder(cx, model, id, rule.reach)
  if (row) return row
  if (rowUnder(cx, model, id, reachOf(cx, model, 'read').reach)) throw denied(cx, model, what, rule)
  throw missing()
}

/** Changes a row that was found, with no rule asked: the values are held, sealed and written, and the earlier version kept. */
function changeFound(cx: DbContext, model: TableModel, before: Row, given: [string, unknown][]): Row {
  const values: Row = {}
  for (const [name, value] of given) {
    const type = model.columns[name]
    if (value === null && mustBeHeld(type)) throw misfit(model, name, 'required', 'is required, and cannot be cleared')
    if (value !== null) fits(model, name, type, value)
    values[name] = value
  }
  if (model.tenant && cx.at) {
    // A row never changes the column that says whose file it lives in.
    sameTenant(model, values, before[model.tenant])
    heldSteps(cx, cx.at, model, values, false)
    sharedLinks(cx, model, values)
  }
  const tx = writeOf(cx)
  const id = String(before.id)
  sealedIn(cx, model, values, id)
  const row = tx.change(model.name, id, { ...values, updatedAt: new Date(cx.now()) }, cx.caller)
  keepVersion(cx, model, before)
  // A vector is no part of a row, so one that the change wrote is named beside the columns that differ.
  const columns = Object.keys(model.columns).filter(
    (name) => !isDeepStrictEqual(before[name], row[name]) || (model.vectors.includes(name) && name in values),
  )
  cx.o.wrote?.({ table: model.name, kind: 'changed', row, before, columns })
  counted(cx, tx, model, before, row)
  return row
}

/** Changes a row, as `change` of a table of `db` does. `of` is the tenant whose file the row lives in. */
export function changeRow(cx: DbContext, table: string, id: string, written: Row, of?: unknown): Row {
  mayWrite(cx)
  begin(cx)
  const model = tableOf(cx.description, table)
  shownWrite(model)
  const file = writeFile(cx, model, of)
  return within(cx, file.at, () => {
    const given = named(cx, model, 'change', written)
    return answered(cx, model, changeFound(cx, model, found(cx, model, 'change', id, file), given))
  })
}

/** The rows of a table that link to a row through one column, as the store holds them. */
function linking(cx: DbContext, table: string, column: string, id: string): Row[] {
  const rows = cx.read({ from: table, where: { col: column, is: id } })
  return Array.isArray(rows) ? rows : []
}

/**
 * Removes a row that was found, with no rule asked. What each link that points at it says with `onRemove` is
 * carried out first, row by row, so that every row it removes or clears is told: a link that refuses stops the
 * removal with T2102 before anything is written.
 */
function removeFound(cx: DbContext, model: TableModel, before: Row, seen: Set<string>): void {
  const tx = writeOf(cx)
  const id = String(before.id)
  if (seen.has(`${model.name} ${id}`)) return
  seen.add(`${model.name} ${id}`)
  // The rows that link to this one from another file stand in files that may be closed: nothing of them is read
  // or written here. The shared file counts the removal, and each file is swept by that count.
  const inFile = (link: { table: string }) => tableOf(cx.description, link.table).tenantTable === model.tenantTable
  const far = model.referrers.some((link) => !inFile(link))
  const links = model.referrers
    .filter(inFile)
    .map((link) => ({ ...link, rows: linking(cx, link.table, link.column, id) }))
  const refusing = links.find((link) => link.onRemove === 'refuse' && link.rows.length)
  if (refusing)
    throw new TentError(
      'T2102',
      `The row of \`${model.name}\` cannot be removed: ${refusing.rows.length} of \`${refusing.table}\` link to it through \`${refusing.column}\`.`,
      { fix: "Remove those rows first, or state `onRemove: 'remove'` or `onRemove: 'clear'` on the link." },
    )
  for (const link of links) {
    const linked = tableOf(cx.description, link.table)
    for (const row of link.rows) {
      if (link.onRemove === 'remove') removeFound(cx, linked, row, seen)
      else changeFound(cx, linked, row, [[link.column, null]])
    }
  }
  tx.remove(model.name, id, cx.caller)
  if (far && model.tenantTable === undefined) raiseRemovals(tx)
  keepVersion(cx, model, before)
  cx.o.wrote?.({ table: model.name, kind: 'removed', row: before })
  counted(cx, tx, model, before, undefined)
}

/** Removes a row, as `remove` of a table of `db` does. `of` is the tenant whose file the row lives in. */
export function removeRow(cx: DbContext, table: string, id: string, of?: unknown): void {
  mayWrite(cx)
  begin(cx)
  const model = tableOf(cx.description, table)
  shownWrite(model)
  const file = writeFile(cx, model, of)
  within(cx, file.at, () => removeFound(cx, model, found(cx, model, 'remove', id, file), new Set()))
}
