import type { SQLInputValue } from 'node:sqlite'
import { TentError } from '../../core/index.ts'
import type { Plan } from '../../core/internal.ts'
import type { ColumnType, ReadAnswer, Row, StorePlan } from '../store.ts'
import type { Filter } from '../worked.ts'
import { isPlan } from '../../core/internal.ts'
import { vectorCopy } from './copy.ts'
import { isRowLink, vectorTable } from './ddl.ts'
import { vectorFrom } from '../vector.ts'
import { failed } from './failed.ts'
import { filledCondition } from './filledFilter.ts'
import { q } from './names.ts'
import { searchJoins } from './search.ts'
import type { Held, Shape } from './shape.ts'
import { rowOf, selected } from './shape.ts'
import { fromStored, toStored } from './values.ts'
import { isWhole } from '../whole.ts'
import { allRows, withWhole } from './wide.ts'

/** What a caller may read of each table that a plan reads through a link: a filter, or `false` for no row. */
type Linked = NonNullable<StorePlan['linked']>

/** What is gathered while one plan is turned into a statement: its values in their order, the tables it reads, and how many plans it holds. */
interface Compiling {
  held: Held
  values: SQLInputValue[]
  tables: Set<string>
  plans: number
}

/** One table as a plan reads it: its shape, and the name its rows are read under. */
interface Reading {
  shape: Shape
  rows: string
}

/** A column as a statement names it: what reads its value, its type, and the table a link in it points to. */
interface Named {
  sql: string
  type: ColumnType
  // Where the column holds the inside number of a row: of its own row for `id`, of the linked row for a link.
  number?: { sql: string; table: string }
}

const unknown = (what: string): TentError => new TentError('T0009', `The store cannot read a plan with ${what}.`)

/**
 * Names a column of a table, which may run through links: each link is followed by its inside number, in the one
 * statement. Where `linked` holds the table of a link, a row of it that the filter leaves out is read as no row.
 */
function named(cx: Compiling, from: Reading, name: string, linked: Linked = {}): Named {
  const [first, ...through] = name.split('.')
  let shape = from.shape
  let type = shape.types[first]
  let sql = `${from.rows}.${q(first)}`
  if (!type) throw unknown(`the column \`${name}\`, which \`${shape.layout.name}\` does not have`)
  for (const next of through) {
    if (!isRowLink(type)) throw unknown(`\`${name}\`, which reads through a column that is no link`)
    const to = reading(cx, type.table)
    shape = to.shape
    type = shape.types[next]
    if (!type) throw unknown(`the column \`${name}\`, which \`${shape.layout.name}\` does not have`)
    const rule = Object.hasOwn(linked, shape.layout.name) ? linked[shape.layout.name] : undefined
    const seen = rule === undefined ? '' : rule === false ? ' AND 0' : ` AND ${condition(cx, to, rule)}`
    sql = `(SELECT ${to.rows}.${q(next)} FROM ${q(shape.layout.name)} AS ${to.rows} WHERE ${to.rows}."_n" = ${sql}${seen})`
  }
  if (isRowLink(type)) return { sql, type, number: { sql, table: type.table } }
  if (name === 'id' && !shape.layout.key)
    return { sql, type, number: { sql: `${from.rows}."_n"`, table: shape.layout.name } }
  return { sql, type }
}

/** What reads the text id that a column stands for: of the row a link points to, or the value itself. */
const asText = (column: Named): string =>
  isRowLink(column.type) ? `(SELECT "id" FROM ${q(column.type.table)} WHERE "_n" = ${column.sql})` : column.sql

/** Takes a value of a filter. Adds it to the values of the statement, as the column keeps it, and answers its place. */
function placed(cx: Compiling, from: Reading, name: string, column: Named, value: unknown): string {
  if (!isRowLink(column.type)) {
    cx.values.push(toStored(column.type, value, from.shape.layout.name, name))
    return '?'
  }
  // A link is kept as the inside number of its row. An id that names no row compares with nothing, and fits no row.
  cx.values.push(typeof value === 'string' ? value : null)
  return `(SELECT "_n" FROM ${q(column.type.table)} WHERE "id" = ?)`
}

/** The condition that a column holds one of the values a plan inside the filter gives: one question, with no list between. */
function inPlan(cx: Compiling, column: Named, plan: StorePlan): string {
  const inner: Reading = reading(cx, plan.from)
  const gives = named(cx, inner, plan.pick?.[0] ?? 'id')
  // Both sides by the inside number where they name rows of one table, and by the text id or the value otherwise.
  const byNumber = column.number && gives.number && column.number.table === gives.number.table
  const [left, right] =
    byNumber && column.number && gives.number ? [column.number.sql, gives.number.sql] : [asText(column), asText(gives)]
  return `${left} IN (SELECT ${right} ${tail(cx, inner, plan)})`
}

// Each operator that compares a column with one value, as the sign SQLite has for it.
const signs: Record<string, string> = {
  is: '=',
  above: '>',
  after: '>',
  atLeast: '>=',
  below: '<',
  before: '<',
  atMost: '<=',
}

/** The condition of one operator on one column. Capitals of the 26 plain letters do not count for `contains` and `startsWith`. */
function compared(cx: Compiling, from: Reading, name: string, operator: string, value: unknown): string {
  // A vector is kept in a table of its own, and a filter asks of it only whether the row has one.
  if (operator === 'empty' && from.shape.layout.columns[name]?.kind === 'vector') {
    const has = `EXISTS (SELECT 1 FROM ${q(vectorTable(from.shape.layout.name, name))} AS "v" WHERE "v"."_n" = ${from.rows}."_n")`
    return value === false ? has : `NOT ${has}`
  }
  // A column that work fills is asked whether its value was made, is missing, is old or failed.
  if (operator === 'filled') return filledCondition(from.rows, from.shape.layout.name, name, value, cx.values)
  const column = named(cx, from, name)
  const held = column.sql
  const isList = column.type.kind === 'list'
  if (operator === 'empty') {
    // Nothing, empty text and an empty list are empty: a `json` column keeps the two as JSON text.
    const none = isList ? "= '[]'" : column.type.kind === 'json' ? `IN ('""', '[]')` : "= ''"
    const empty = `(${held} IS NULL OR ${held} ${none})`
    return value === false ? `NOT ${empty}` : empty
  }
  // A value that is nothing fits no row: `empty` is the word for a column that holds nothing.
  if (value === undefined || value === null) return '0'
  if (Object.hasOwn(signs, operator)) return `${held} ${signs[operator]} ${placed(cx, from, name, column, value)}`
  if (operator === 'not') return `${held} IS NOT ${placed(cx, from, name, column, value)}`
  if (operator === 'in') {
    if (isPlan(value)) return inPlan(cx, column, value)
    if (!Array.isArray(value)) throw unknown('an `in` that holds neither a list nor a plan')
    return `${held} IN (${value.map((one) => placed(cx, from, name, column, one)).join(', ')})`
  }
  if (operator === 'contains' && isList) {
    cx.values.push(JSON.stringify(value))
    return `EXISTS (SELECT 1 FROM json_each(${held}) WHERE json_quote("value") = ?)`
  }
  if (operator === 'contains') {
    cx.values.push(String(value))
    return `instr(lower(${held}), lower(?)) > 0`
  }
  if (operator === 'startsWith') {
    cx.values.push(String(value), String(value))
    return `substr(lower(${held}), 1, length(?)) = lower(?)`
  }
  throw unknown(`the operator \`${operator}\``)
}

/** The condition that a stored filter asks of the rows of a table. */
function condition(cx: Compiling, from: Reading, filter: Filter): string {
  const joined = (filters: Filter[], by: string, none: string) =>
    filters.length ? `(${filters.map((one) => condition(cx, from, one)).join(by)})` : none
  if ('any' in filter && Array.isArray(filter.any)) return joined(filter.any, ' OR ', '1')
  if ('all' in filter && Array.isArray(filter.all)) return joined(filter.all, ' AND ', '1')
  // What does not fit is what a row with no value does not fit either: SQLite alone would answer that it does not know.
  if (!('col' in filter)) return `NOT coalesce(${joined('not' in filter ? [filter.not] : [], '', '0')}, 0)`
  const parts = Object.entries(filter)
    .filter(([name]) => name !== 'col' && name !== 'given')
    .map(([operator, value]) => compared(cx, from, filter.col, operator, value))
  return parts.length ? `(${parts.join(' AND ')})` : '1'
}

/**
 * The condition that holds for the rows which come after the row a cursor names, in the order of the plan. A column
 * that holds nothing comes first in an order that rises and last in one that falls, as SQLite sorts it.
 */
function after(cx: Compiling, from: Reading, sort: NonNullable<Plan['sort']>, values: unknown[], at = 0): string {
  if (at === sort.length) {
    cx.values.push(String(values[at]))
    return `${from.rows}."id" > ?`
  }
  const { by, down } = sort[at]
  const column = named(cx, from, by)
  const value = values[at]
  const nothing = value === undefined || value === null
  // A whole number that the runtime cannot hold stands in the mark by its digits, beside the values and under
  // the place of its column, and is compared as it is.
  const beside: unknown = values[sort.length + 1]
  const digits: unknown = typeof beside === 'object' && beside !== null ? Reflect.get(beside, String(at)) : undefined
  const place = () => {
    if (!isWhole(digits)) return placed(cx, from, by, column, value)
    cx.values.push(BigInt(digits))
    return '?'
  }
  const later = nothing
    ? down
      ? '0'
      : `${column.sql} IS NOT NULL`
    : down
      ? `(${column.sql} < ${place()} OR ${column.sql} IS NULL)`
      : `${column.sql} > ${place()}`
  const same = nothing ? `${column.sql} IS NULL` : `${column.sql} = ${place()}`
  return `(${later} OR (${same} AND ${after(cx, from, sort, values, at + 1)}))`
}

/** Begins the reading of one table of a statement, under a name of its own. */
function reading(cx: Compiling, table: string): Reading {
  cx.tables.add(table)
  return { shape: cx.held.shape(table), rows: `"t${cx.plans++}"` }
}

/** What follows the columns of a statement: the table, the conditions, the order and the cut of a plan. */
function tail(cx: Compiling, from: Reading, plan: StorePlan, grouped?: string[]): string {
  // A search joins its index before the conditions, so its words are the first values of this tail.
  let found: { sql: string; rank: string } | undefined
  if (typeof plan.search === 'string') {
    if (!from.shape.layout.search.length) throw unknown(`a search of \`${plan.from}\`, which states no \`search\``)
    const joined = searchJoins(from.shape.layout, from.rows, plan.search)
    if (joined) {
      cx.held.indexed(plan.from)
      found = joined
      cx.values.push(...joined.values)
    }
  }
  const where: string[] = []
  if (plan.one === 'get') {
    const key = from.shape.layout.key ?? ['id']
    const given: Record<string, unknown> =
      typeof plan.id === 'object' && plan.id !== null ? { ...plan.id } : { [key[0]]: plan.id }
    for (const name of key) where.push(compared(cx, from, name, 'is', given[name]))
  }
  if (plan.where) where.push(condition(cx, from, plan.where))
  const paged = 'after' in plan && !from.shape.layout.key
  const sort = plan.sort ?? []
  if (paged && Array.isArray(plan.after)) where.push(after(cx, from, sort, plan.after))
  let sql = `FROM ${q(plan.from)} AS ${from.rows}${found?.sql ?? ''}${where.length ? ` WHERE ${where.join(' AND ')}` : ''}`
  if (plan.count) return sql
  // A group with no key is one group of every row that is read, and no group where none is read: SQLite alone
  // would answer one record for no row.
  if (grouped?.length === 0) return `${sql} HAVING count(*) > 0`
  if (grouped) return `${sql} GROUP BY ${grouped.join(', ')} ORDER BY ${grouped.join(', ')}`
  const order = [
    ...sort.map(({ by, down }) => `${named(cx, from, by, plan.linked).sql}${down ? ' DESC' : ''}`),
    // Rows that a search found come the best first, where no stated order puts them apart. A page is cut by its
    // sort and its id alone, which a cursor can name.
    ...(found && !paged ? [found.rank] : []),
    // Rows with no stated order, and rows that a stated order leaves side by side, come in the order they were
    // added.
    ...(from.shape.layout.key ? [] : [`${from.rows}.${paged ? '"id"' : '"_n"'}`]),
  ]
  if (order.length) sql += ` ORDER BY ${order.join(', ')}`
  const one = plan.one !== undefined
  // SQLite takes a skip only after a limit, and reads a limit under zero as none.
  if (one || plan.limit !== undefined || plan.skip !== undefined) {
    sql += ' LIMIT ? OFFSET ?'
    cx.values.push(one ? 1 : Number(plan.limit ?? -1), Number(plan.skip ?? 0))
  }
  return sql
}

// What a group works out of a column, as SQLite names it.
const worked = ['sum', 'avg', 'min', 'max']

/** Reads the records of a group: one for each value of what it groups by, with what was counted and worked out. */
function groups(cx: Compiling, from: Reading, plan: StorePlan, group: NonNullable<Plan['group']>): Row[] {
  const by = group.by.map((name) => ({ name, column: named(cx, from, name, plan.linked) }))
  const values = Object.entries(group.values).map(([name, value]) => {
    const [word] = worked.filter((one) => one in value)
    const column = word ? named(cx, from, String(Reflect.get(value, word)), plan.linked) : undefined
    return { name, word, column }
  })
  const columns = [
    ...by.map(({ name, column }) => `${asText(column)} AS ${q(name)}`),
    ...values.map(
      ({ name, word, column }) => `${word && column ? `${word}(${column.sql})` : 'count(*)'} AS ${q(name)}`,
    ),
  ]
  const sql = `SELECT ${columns.join(', ')} ${tail(
    cx,
    from,
    plan,
    // What reads a column under a rule holds values of the statement, and stands in it once: by its place.
    by.map(({ column }, at) => (column.sql.includes('?') ? String(at + 1) : column.sql)),
  )}`
  return allRows(cx.held.statement(sql), cx.values).map((read) => {
    const record: Row = {}
    for (const { name, column } of by) {
      const value = isRowLink(column.type) ? read[name] : fromStored(column.type, read[name])
      if (value !== undefined && value !== null) record[name] = value
    }
    for (const { name, word, column } of values) {
      // The smallest and the largest are values of their column, and everything else is a number.
      const value = column && (word === 'min' || word === 'max') ? fromStored(column.type, read[name]) : read[name]
      if (value !== undefined && value !== null) record[name] = value
    }
    return record
  })
}

/**
 * The rows of a plan with `near`, in four parts. Where the plan has a filter, one question gives the inside numbers
 * of the rows that pass; without one every row of the copy is looked at. The copy works the distance of each out
 * and keeps the nearest, after `within`. Their rows are then read as in any plan, and each is given its distance.
 * A row that the write under way has removed is left out, so fewer rows than the limit can come back. A row that
 * the write added is not looked at: the copy holds no vector of it yet, and its inside number may be that of a row
 * the same write removed, whose vector the copy still holds.
 */
function nearest(cx: Compiling, from: Reading, plan: Plan, near: NonNullable<Plan['near']>): Row[] {
  const { shape, rows } = from
  const table = q(plan.from)
  if (!Object.hasOwn(shape.vectors, near.col)) throw unknown(`\`near\` on \`${near.col}\`, which is no vector column`)
  const to = Array.isArray(near.value) ? near.value.map(Number) : []
  const only = plan.where
    ? allRows(
        cx.held.statement(
          `SELECT ${rows}."_n" AS "n" FROM ${table} AS ${rows} WHERE ${condition(cx, from, plan.where)}`,
        ),
        cx.values,
      ).map((row) => Number(row.n))
    : undefined
  const limit = plan.one === undefined ? Number(plan.limit) : 1
  const fresh = cx.held.fresh(plan.from)
  const copy = cx.held.copy(plan.from, near.col)
  const measure = near.measure === 'straight' ? 'straight' : 'cosine'
  const most = Number.isFinite(limit) ? limit : 0
  const within = typeof near.within === 'number' ? { within: near.within } : {}
  const asked = { ...(only ? { only } : {}), ...(fresh?.size ? { without: fresh } : {}) }
  const found = copy.exact
    ? copy.nearest(to, measure, most, { ...asked, ...within })
    : decided(cx, plan.from, near.col, to, measure, most, within, copy.nearest(to, measure, most * nearOver, asked))
  if (!found.length) return []
  const names = (plan.pick ?? Object.keys(shape.types)).filter((name) => name !== 'distance')
  const read = allRows(
    cx.held.statement(
      `SELECT ${rows}."_n" AS "_n", ${selected(shape, rows, names)} FROM ${table} AS ${rows} ` +
        `WHERE ${rows}."_n" IN (SELECT "value" FROM json_each(?))`,
    ),
    [JSON.stringify(found.map(([n]) => n))],
  )
  const byNumber = new Map(read.map((row) => [Number(row._n), row]))
  // A copy at one byte a number answers rows that are near and not sure to be the nearest: each row says so.
  const told = copy.exact ? {} : { exact: false }
  return found.flatMap(([n, distance]) => {
    const row = byNumber.get(n)
    return row ? [{ ...rowOf(shape, row), distance, ...told }] : []
  })
}

// A copy at one byte a number hands this many times the limit to be decided by the full vectors.
const nearOver = 4

/**
 * Of the rows that a copy at one byte a number found near, the nearest by their full vectors, read from the table
 * of the column: their distances and their order are those of the full copy, and `within` is held to them.
 */
function decided(
  cx: Compiling,
  table: string,
  column: string,
  to: number[],
  measure: 'cosine' | 'straight',
  limit: number,
  within: { within?: number },
  near: [number, number][],
): [number, number][] {
  if (!near.length) return []
  const read = allRows(
    cx.held.statement(
      `SELECT "_n", "v" FROM ${q(vectorTable(table, column))} WHERE "_n" IN (SELECT "value" FROM json_each(?))`,
    ),
    [JSON.stringify(near.map(([n]) => n))],
  )
  const full = vectorCopy(to.length)
  for (const row of read) if (row.v instanceof Uint8Array) full.set(Number(row._n), vectorFrom(row.v))
  return full.nearest(to, measure, limit, within)
}

/**
 * Takes what an open store holds and a plan whose every value is worked out. Answers what the plan reads - rows in
 * the order they were added where none is stated, one row or nothing, a number, or the records of a group - and
 * the tables it read. A plan inside a filter is read in the same statement. A row holds text ids only. No access
 * rule is applied here: whoever hands the plan has written each rule into it. Where the plan holds `after`, its
 * value is the sort values and the id of the last row of the page before, and the rows are cut by their ids.
 * Every text that a plan is turned into is compiled and run from here, so what SQLite itself refuses of one is
 * thrown as an error of ours: T0009 with the words of SQLite, and that failure as its cause.
 */
export function readPlan(held: Held, plan: StorePlan): ReadAnswer {
  try {
    return answered(held, plan)
  } catch (error) {
    throw failed(error, plan.from)
  }
}

/**
 * Takes what an open store holds and a plan of rows: no search, no nearness, no group. Answers what SQLite's own
 * plan of its statement says, one line for each step, as `SCAN t0` for a read of a whole table: so a slow read
 * tells which index it lacks. Nothing for a plan of another kind.
 */
export function explainPlan(held: Held, plan: StorePlan): string[] {
  if (plan.near || plan.group || typeof plan.search === 'string') return []
  const cx: Compiling = { held, values: [], tables: new Set(), plans: 0 }
  try {
    const from = reading(cx, plan.from)
    const text = `EXPLAIN QUERY PLAN SELECT ${selected(from.shape, from.rows, plan.pick)} ${tail(cx, from, plan)}`
    return allRows(held.statement(text), cx.values).map((row) =>
      String(row.detail).replace(new RegExp(`\\b${from.rows.replace(/"/g, '')}\\b`, 'g'), plan.from),
    )
  } catch (error) {
    throw failed(error, plan.from)
  }
}

/** Turns a plan into its statements, and runs them. */
function answered(held: Held, plan: StorePlan): ReadAnswer {
  const cx: Compiling = { held, values: [], tables: new Set(), plans: 0 }
  const from = reading(cx, plan.from)
  const answer = (value: ReadAnswer['value']): ReadAnswer => ({ value, tables: [...cx.tables] })
  if (plan.near) {
    const rows = nearest(cx, from, plan, plan.near)
    return answer(plan.one === undefined ? rows : rows[0])
  }
  if (plan.group) return answer(groups(cx, from, plan, plan.group))
  if (plan.count) {
    const [counted] = allRows(held.statement(`SELECT count(*) AS "n" ${tail(cx, from, plan)}`), cx.values)
    return answer(Number(counted?.n ?? 0))
  }
  const rows = allRows(
    held.statement(`SELECT ${selected(from.shape, from.rows, plan.pick)} ${tail(cx, from, plan)}`),
    cx.values,
  ).map((row) => withWhole(row, rowOf(from.shape, row)))
  return answer(plan.one === undefined ? rows : rows[0])
}
