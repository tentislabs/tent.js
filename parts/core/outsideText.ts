import { isStored } from './record.ts'
import type { Description } from './description.ts'
import { callsIn, reachedFrom, recordOf, tablesOf } from './reaching.ts'

/** The rule of a table for one kind of access: `read`, `add`, `change` or `remove`. */
export const tableRuleOf = (table: Record<string, unknown> | undefined, what: string): unknown =>
  Reflect.get(Object(table?.access), what)

/** Whether one tool takes in text from outside, by itself. */
export function takesOutside(description: Description, name: string): boolean {
  const record = recordOf(description, name)
  if (!record) return name.includes('.')
  if (record.form === 'code' || record.kind === 'python') return true
  if (isStored(record.agent)) return false
  const calls = callsIn([record.body, record.onFail])
  if (calls.some((one) => one.kind === 'service' || (one.kind === 'builtin' && one.name === 'files.text'))) return true
  if (calls.some((one) => one.kind === 'model' && one.member === 'hear')) return true
  if (calls.some((one) => one.kind === 'function' && recordOf(description, one.name)?.kind === 'action')) return true
  if (record.kind !== 'query') return false
  // A query over a table that callers other than a row's owner may write.
  return tablesOf(record).some((table) => {
    const stored = Object.hasOwn(description.tables, table) ? description.tables[table] : undefined
    return ['add', 'change'].some((what) => {
      const rule = Reflect.get(Object(tableRuleOf(stored, what)), 'rule')
      return rule !== undefined && rule !== 'nobody' && rule !== 'owner'
    })
  })
}

/**
 * Takes a description and a tool. Answers whether it takes in text from outside, by itself or by anything it can be
 * seen to reach: a tool of an outside server or of a source, code, a `python`, a plain body that calls a service, an
 * action, `files.text` or `hear`, and a query over a table that callers other than a row's owner may write.
 */
export const fromOutside = (description: Description, name: string): boolean =>
  [name, ...reachedFrom(description, name)].some((one) => takesOutside(description, one))
