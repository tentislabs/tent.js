import { TentError } from '../core/index.ts'
import type { DbContext } from './context.ts'
import type { FileName } from './fileName.ts'
import { notOneFile } from './fileName.ts'
import { fileOf } from './fileReads.ts'
import { insideOf } from './filesInside.ts'
import { misfitsType } from './findMisfits.ts'
import { isTenant } from './isTenant.ts'
import { mustBeHeld } from './keptType.ts'
import type { TableModel } from './model.ts'
import { tableOf } from './model.ts'
import type { Row } from './store.ts'

/** The file that a write of a table names, and whether it names a tenant at all. */
export interface WriteFile {
  // The file the write works in: nothing for a table of the shared file.
  at?: FileName
  // What names no tenant names no file: a write for it is refused once its rule was asked.
  named: boolean
}

/**
 * Takes the context of a `db`, a table, and the tenant that a write names with `of`. Answers the file the row
 * lives in. What names no tenant is answered as a file all the same, which no store stands behind, so that the
 * rule of the write is asked first and a caller learns nothing from the code. Throws T2109 for a write on a tenant
 * table that names no tenant.
 */
export function writeFile(cx: DbContext, model: TableModel, of: unknown): WriteFile {
  const file = fileOf(cx, model, of, false)
  if (file !== 'none') return { named: true, ...(file ? { at: file } : {}) }
  return { named: false, at: { table: String(model.tenantTable), id: String(of) } }
}

/**
 * Holds that the file of a write names a tenant. Throws T2104 for an id that is none, and for one whose row the
 * shared file does not hold: where a file of such a tenant still stands, it is written for nobody.
 */
export function heldTenant(cx: DbContext, model: TableModel, file: WriteFile): void {
  if (!file.at || !cx.files) return
  if (!file.named || !isTenant(cx.files.shared, file.at))
    throw new TentError(
      'T2104',
      `A write of \`${model.name}\` names a row of \`${model.tenantTable}\` that does not exist.`,
    )
}

/**
 * Holds the tenant that a write gives in the tenant column of its table: a row is added with the
 * tenant of `of`, and never changes it. Throws T2109 for another value.
 */
export function sameTenant(model: TableModel, values: Row, tenant: unknown): void {
  const given = model.tenant === undefined ? undefined : values[model.tenant]
  if (given === undefined || given === tenant) return
  throw notOneFile(
    `\`${model.tenant}\` of \`${model.name}\` says whose file a row lives in, and a write gives it another tenant`,
    'Move a row to another tenant by removing it there and adding it here, in two changes.',
  )
}

/**
 * Holds each link into the shared file that a write gives against the shared file, by one read for each: a real
 * link cannot cross two files. Throws T2104 for a link whose row is not there.
 */
export function sharedLinks(cx: DbContext, model: TableModel, values: Row): void {
  for (const [column, type] of Object.entries(model.columns)) {
    const value = values[column]
    if (type.kind !== 'link' || column === model.tenant || value === undefined || value === null) continue
    if (model.sealed.includes(column) || tableOf(cx.description, type.table).tenantTable !== undefined) continue
    if (cx.read({ from: type.table, one: 'get', id: value }) === undefined)
      throw new TentError(
        'T2104',
        `\`${column}\` of \`${model.name}\` names a row of \`${type.table}\` that does not exist.`,
      )
  }
}

/**
 * Holds what a write leaves in a row against the steps its file is held to before a switch: a column that must
 * hold a value from then on holds one, and a value fits the type its column is to have. Takes the values the write
 * gives, and whether it adds the row. Throws T2107, which names the column.
 */
export function heldSteps(cx: DbContext, file: FileName, model: TableModel, values: Row, adding: boolean): void {
  if (!cx.files) return
  for (const step of insideOf(cx.files).heldTo(file, model.name)) {
    const column = step.column
    if (column === undefined || !(adding || column in values)) continue
    const value = values[column]
    const empty = value === undefined || value === null
    const needs = step.do === 'require' || (step.to !== undefined && mustBeHeld(step.to))
    const type = model.columns[column]
    if (empty ? needs : step.do === 'retype' && step.to && type && misfitsType(type, step.to, value))
      throw new TentError(
        'T2107',
        `\`${column}\` of \`${model.name}\` is held to what the next version asks of it, and the value does not fit.`,
        { fields: { [column]: empty ? 'required' : 'type' } },
      )
  }
}
