import { TentError } from '../../core/index.ts'
import { q } from './names.ts'

/**
 * Takes the name a table's rows are read under, the table, the column, the state asked for, and what keeps the
 * values of the statement. Answers the condition of `{ col, filled }` on a column that work fills, by its rows of
 * `_t_filled` in the same file and what that file keeps in `_t_meta` of the work that counts as running: `made`,
 * `missing` (no value was made), `old` (made, and due or made by a work that counts no more) or `failed`.
 */
export function filledCondition(
  rows: string,
  table: string,
  column: string,
  state: unknown,
  values: unknown[],
): string {
  const works = `(SELECT "value" FROM ${q('_t_meta')} WHERE "key" = ?)`
  const counted = `("f"."work" = json_extract(${works}, '$.base') OR "f"."work" IN (SELECT "value" FROM json_each(${works}, '$.also')))`
  const of = (more: string, key: boolean): string => {
    values.push(table, column)
    if (key) values.push(`works.${table}.${column}`, `works.${table}.${column}`)
    return `EXISTS (SELECT 1 FROM ${q('_t_filled')} AS "f" WHERE "f"."tableName" = ? AND "f"."rowId" = ${rows}."id" AND "f"."columnName" = ? AND ${more})`
  }
  // Each key is placed twice where the work that counts is read: once for its base, once for those it keeps.
  if (state === 'made') return of(`"f"."madeAt" IS NOT NULL AND "f"."state" <> 'due' AND ${counted}`, true)
  if (state === 'old') return of(`"f"."madeAt" IS NOT NULL AND ("f"."state" = 'due' OR NOT ${counted})`, true)
  if (state === 'failed') return of(`"f"."state" = 'failed'`, false)
  if (state === 'missing') return `NOT ${of(`"f"."madeAt" IS NOT NULL`, false)}`
  throw new TentError('T0009', `The store cannot read a plan with \`filled\` of ${JSON.stringify(state)}.`)
}
