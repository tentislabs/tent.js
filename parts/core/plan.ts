import { TentError } from './errors.ts'
import type { Filter } from './filter.ts'
import { filterOf } from './filter.ts'
import type { Tables } from './lists.ts'
import { isMarked, mark } from './mark.ts'
import { keepPlan } from './planOf.ts'
import type { GivenFields, HandedFields } from './type.ts'
import { asValue, asValues } from './written.ts'

/** A plan as it is stored: a table, and what was asked of its rows. */
export interface PlanRecord {
  from: string
  of?: unknown
  where?: Filter
  search?: unknown
  with?: string[]
  sort?: { by: string; down?: true }[]
  limit?: unknown
  skip?: unknown
  after?: unknown
  pick?: string[]
  one?: 'get' | 'first'
  id?: unknown
  count?: true
  history?: true
  group?: { by: string[]; values: Record<string, object> }
  near?: { col: string; value: unknown; measure?: string; within?: unknown }
  rank?: { model: string; words: unknown; top?: unknown }
}

/** A write as it is stored. */
type WriteRecord =
  | { add: string; of?: unknown; values: Record<string, unknown> }
  | { change: string; of?: unknown; id: unknown; values: Record<string, unknown> }
  | { remove: string; of?: unknown; id: unknown }

/** A trigger as it is stored. */
type TriggerRecord =
  | { table: string; when: 'added' | 'changed' | 'removed'; where?: Filter; columns?: string[] }
  | { every: string }
  | { cron: string; zone?: string }
  | { event: string }

// The two members below carry a type and never a value: what a write answers, and what a trigger hands its flow.
declare const answers: unique symbol
declare const fires: unique symbol

/** A write of one row, which a change holds in `set`. */
export type Write<Answer = unknown> = WriteRecord & { readonly [answers]?: Answer }

/** What starts a flow, with the event that the flow is handed. */
export type Trigger<Event = unknown> = TriggerRecord & { readonly [fires]?: Event }

/** The names of the tables of the project. */
export type TableName = Extract<keyof Tables, string>

/** The columns of a table definition. */
export type ColumnsOf<Table> = Table extends { options: { columns?: infer Columns } } ? Columns : never

/** A row of a table with these columns, as code is handed it. */
export type RowOf<Columns> = { id: string; createdAt: Date; updatedAt: Date } & HandedFields<Columns>

/** A row of a table of the project, by the name of the table. */
export type Row<Name extends TableName> = RowOf<ColumnsOf<Tables[Name]>>

/** The names a filter and a sort may hold: a column, one of the three every table has, or a column through a link. */
type ColumnName<Columns> = Extract<keyof Columns, string> | 'id' | 'createdAt' | 'updatedAt' | `${string}.${string}`

/** A filter as it is written: a column with a value or with operators, and `any`, `all` and `not` to join filters. */
export type WrittenFilter<Columns> = { [Name in ColumnName<Columns>]?: unknown } & {
  any?: readonly WrittenFilter<Columns>[]
  all?: readonly WrittenFilter<Columns>[]
  not?: unknown
}

/** The row a link column points to, where its table is one of the project. */
type LinkedRow<Column> = Column extends { table: infer Name } ? (Name extends TableName ? Row<Name> : string) : string

/** A row in which a link column holds the linked row. */
type WithLink<R, Columns, Name extends keyof Columns> = Omit<R, Name> & { [Key in Name]: LinkedRow<Columns[Name]> }

/** What a plan answers: rows, one row or nothing, a number, or a page of rows. */
export type PlanAnswer<R, Mode> = Mode extends 'rows'
  ? R[]
  : Mode extends 'one'
    ? R | undefined
    : Mode extends 'count'
      ? number
      : Mode extends 'page'
        ? { rows: R[]; next?: string }
        : unknown

/** What `near` takes beside its column and its value. */
interface NearOptions {
  measure?: 'cosine' | 'straight'
  within?: number
}

/** What `rank` takes beside its model and its words. */
interface RankOptions {
  top?: number
}

/** A model as `rank` is handed it: its definition, or its name. */
type RankModel = string | { readonly definition: string }

/** A plan: a query written in our words. Each member answers a new plan, and nothing is carried out. */
export interface PlanBuilder<Columns = unknown, R = unknown, Mode = 'rows'> {
  readonly plan: PlanRecord
  where(filter: WrittenFilter<Columns>): PlanBuilder<Columns, R, Mode>
  search(text: string): PlanBuilder<Columns, R, Mode>
  group(
    by: ColumnName<Columns> | readonly ColumnName<Columns>[],
    values: Record<string, object>,
  ): PlanBuilder<Columns, Record<string, unknown>, 'rows'>
  with<Name extends Extract<keyof Columns, string>>(
    column: Name,
  ): PlanBuilder<Columns, WithLink<R, Columns, Name>, Mode>
  with(column: `${string}.${string}`): PlanBuilder<Columns, R, Mode>
  near(column: string, value: readonly number[], o?: NearOptions): PlanBuilder<Columns, R & { distance: number }, Mode>
  rank(model: RankModel, words: string, o?: RankOptions): PlanBuilder<Columns, R, Mode>
  newest(column: ColumnName<Columns>): PlanBuilder<Columns, R, Mode>
  oldest(column: ColumnName<Columns>): PlanBuilder<Columns, R, Mode>
  sort(...columns: string[]): PlanBuilder<Columns, R, Mode>
  limit(n: number): PlanBuilder<Columns, R, Mode>
  skip(n: number): PlanBuilder<Columns, R, Mode>
  after(cursor: string | undefined): PlanBuilder<Columns, R, 'page'>
  pick<Name extends Extract<keyof R, string>>(columns: readonly Name[]): PlanBuilder<Columns, Pick<R, Name>, Mode>
  first(): PlanBuilder<Columns, R, 'one'>
  count(): PlanBuilder<Columns, R, 'count'>
}

/** The values of a row as a write takes them: each may be left out, and `null` clears a column. */
type WriteValues<Columns> = { [Name in keyof GivenFields<Columns>]?: GivenFields<Columns>[Name] | null }

/** What a table gives: every member of a plan, the plans that start at a table, the writes and the triggers. */
export interface TableMembers<Columns> extends PlanBuilder<Columns, RowOf<Columns>, 'rows'> {
  get(id: string): PlanBuilder<Columns, RowOf<Columns>, 'one'>
  count(filter?: WrittenFilter<Columns>): PlanBuilder<Columns, RowOf<Columns>, 'count'>
  history(id: string): PlanBuilder<Columns, { at: Date; by: string; value: RowOf<Columns> }, 'rows'>
  add(values: WriteValues<Columns>): Write<RowOf<Columns>>
  change(id: string, values: WriteValues<Columns>): Write<RowOf<Columns>>
  remove(id: string): Write<undefined>
  added(o?: { where?: WrittenFilter<Columns> }): Trigger<{ kind: 'added'; table: string; row: RowOf<Columns> }>
  changed(o?: {
    where?: WrittenFilter<Columns>
    columns?: readonly Extract<keyof Columns, string>[]
  }): Trigger<{ kind: 'changed'; table: string; row: RowOf<Columns>; before: RowOf<Columns>; columns: string[] }>
  removed(o?: { where?: WrittenFilter<Columns> }): Trigger<{ kind: 'removed'; table: string; row: RowOf<Columns> }>
  // Of a tenant table: the tenant whose file the rows live in, which every chain and write begins with.
  of(tenant: string): TableMembers<Columns>
}

/** What a trigger of a table may state. */
interface TriggerOptions {
  where?: unknown
  columns?: readonly string[]
}

const list = (written: unknown): string[] => (Array.isArray(written) ? [...written] : [String(written)])

/** Joins a filter to the one a plan already holds: both must fit. */
function joined(held: Filter | undefined, more: Filter): Filter {
  if (!held) return more
  return 'all' in held && Array.isArray(held.all) ? { all: [...held.all, more] } : { all: [held, more] }
}

/** Throws T1014: a member of a plan was handed a value of another kind than it takes. */
function wrong(member: string, takes: string): never {
  throw new TentError('T1014', `${member} of a plan takes ${takes}.`, { fix: 'Hand it a value of that kind.' })
}

/** Takes a column as `sort` writes it, with a hyphen in front for the largest first. Answers its stored entry. */
const sorted = (column: unknown): { by: string; down?: true } => {
  if (typeof column !== 'string') return wrong('sort', 'the names of columns, each as text')
  return column.startsWith('-') ? { by: column.slice(1), down: true } : { by: column }
}

/**
 * Takes a count of rows as `limit` and `skip` are handed it. Answers it as it is stored: a whole number of zero
 * or more, or a reference, which is worked out when the plan is carried out. Throws T1014 for anything else: the
 * store would read every row for a number under zero, and fail in its own words for one that is not whole.
 */
function countOf(member: string, n: unknown): unknown {
  if (isMarked(n)) return asValue(n)
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 ? n : wrong(member, 'a whole number of zero or more')
}

/** Answers what `near` stores: the measure only where it is not the cosine, which holds when none is written. */
function nearOf(col: string, value: unknown, o: NearOptions = {}): PlanRecord['near'] {
  if (typeof o !== 'object' || o === null) return wrong('near', 'a record of options, or nothing')
  return {
    col,
    value: asValue(value),
    ...(o.measure && o.measure !== 'cosine' ? { measure: o.measure } : {}),
    ...(o.within === undefined ? {} : { within: asValue(o.within) }),
  }
}

/** Answers what `rank` stores: the name of the model, the words the rows are ranked by, and how many are kept. */
function rankOf(model: unknown, words: unknown, o: RankOptions = {}): PlanRecord['rank'] {
  const name = typeof model === 'string' ? model : Reflect.get(Object(model), 'definition')
  if (typeof name !== 'string') return wrong('rank', 'a model, and the words the rows are ranked by')
  if (typeof o !== 'object' || o === null) return wrong('rank', 'a record of options, or nothing')
  return { model: name, words: asValue(words), ...(o.top === undefined ? {} : { top: countOf('rank', o.top) }) }
}

/** Takes the stored record of a plan. Answers the plan: its record, and the members that each answer a new plan. */
function chain(record: PlanRecord): object {
  const next = (more: Partial<PlanRecord>) => chain({ ...record, ...more })
  const sort = record.sort ?? []
  return keepPlan(
    {
      plan: record,
      where: (filter: unknown) => next({ where: joined(record.where, filterOf(filter)) }),
      search: (text: unknown) => next({ search: asValue(text) }),
      group: (by: unknown, values: Record<string, object>) => {
        if (typeof values !== 'object' || values === null) return wrong('group', 'a record of the values it works out')
        const worked = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, { ...v }]))
        return next({ group: { by: list(by), values: worked } })
      },
      with: (...columns: string[]) => next({ with: [...(record.with ?? []), ...columns] }),
      near: (col: string, value: unknown, o?: NearOptions) => next({ near: nearOf(col, value, o) }),
      rank: (model: unknown, words: unknown, o?: RankOptions) => next({ rank: rankOf(model, words, o) }),
      newest: (column: string) => next({ sort: [...sort, { by: column, down: true }] }),
      oldest: (column: string) => next({ sort: [...sort, { by: column }] }),
      sort: (...columns: string[]) => next({ sort: [...sort, ...columns.map(sorted)] }),
      limit: (n: unknown) => next({ limit: countOf('limit', n) }),
      skip: (n: unknown) => next({ skip: countOf('skip', n) }),
      after: (cursor: unknown) => next({ after: asValue(cursor) }),
      pick: (columns: unknown) => next({ pick: list(columns) }),
      first: () => next({ one: 'first' }),
      count: () => next({ count: true }),
    },
    record,
  )
}

/**
 * Takes the name of a table, and the tenant whose file its rows live in where it is a tenant table. Answers
 * what a table gives: every member of a plan, the plans that start at a table, the writes and the triggers, each
 * as the record that is stored for it.
 */
export function tableMembers<Columns>(table: string, of?: { of: unknown }): TableMembers<Columns>
export function tableMembers(table: string, of: { of?: unknown } = {}): object {
  const from: PlanRecord = { from: table, ...of }
  const trigger = (when: 'added' | 'changed' | 'removed', o: TriggerOptions = {}) => {
    if (typeof o !== 'object' || o === null || Array.isArray(o)) return wrong(when, 'a record of options, or nothing')
    if (o.columns !== undefined && !Array.isArray(o.columns)) return wrong(when, 'the names of its columns as a list')
    return mark({
      table,
      when,
      ...(o.where === undefined ? {} : { where: filterOf(o.where) }),
      ...(o.columns === undefined ? {} : { columns: [...o.columns] }),
    })
  }
  return keepPlan(
    {
      ...chain(from),
      get: (id: unknown) => chain({ ...from, one: 'get', id: asValue(id) }),
      count: (filter?: unknown) =>
        chain({ ...from, ...(filter === undefined ? {} : { where: filterOf(filter) }), count: true }),
      history: (id: unknown) => chain({ ...from, history: true, id: asValue(id) }),
      add: (values: Record<string, unknown>) => mark({ add: table, ...of, values: asValues(values) }),
      change: (id: unknown, values: Record<string, unknown>) =>
        mark({ change: table, ...of, id: asValue(id), values: asValues(values) }),
      remove: (id: unknown) => mark({ remove: table, ...of, id: asValue(id) }),
      added: (o?: TriggerOptions) => trigger('added', o),
      changed: (o?: TriggerOptions) => trigger('changed', o),
      removed: (o?: TriggerOptions) => trigger('removed', o),
      of: (tenant: unknown) => tableMembers(table, { of: asValue(tenant) }),
    },
    from,
  )
}
