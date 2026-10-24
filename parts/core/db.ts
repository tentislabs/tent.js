import type { Tables } from './lists.ts'
import type { ColumnsOf, PlanRecord, RowOf, TableName, Write, WrittenFilter } from './plan.ts'
import type { GivenFields } from './type.ts'

/** What a member of `db` answers: the value at once, or a promise of it where waiting is allowed. */
type Answer<Waits, Value> = Waits extends true ? Promise<Value> : Value

/** A row in which a link column holds the linked row. */
type WithLink<R, Columns, Name extends keyof Columns> = Omit<R, Name> & {
  [Key in Name]: Columns[Name] extends { table: infer Linked }
    ? Linked extends TableName
      ? RowOf<ColumnsOf<Tables[Linked]>>
      : string
    : string
}

/** A chain through `db`: the members of a plan, and the three that carry it out. */
interface DbChain<Columns, R, Waits> {
  where(filter: WrittenFilter<Columns>): DbChain<Columns, R, Waits>
  search(text: string): DbChain<Columns, R, Waits>
  group(
    by: string | readonly string[],
    values: Record<string, object>,
  ): DbChain<Columns, Record<string, unknown>, Waits>
  with<Name extends Extract<keyof Columns, string>>(column: Name): DbChain<Columns, WithLink<R, Columns, Name>, Waits>
  with(column: `${string}.${string}`): DbChain<Columns, R, Waits>
  near(
    column: string,
    value: readonly number[],
    o?: { measure?: 'cosine' | 'straight'; within?: number },
  ): DbChain<Columns, R & { distance: number }, Waits>
  rank(model: string | { readonly definition: string }, words: string, o?: { top?: number }): DbChain<Columns, R, Waits>
  newest(column: string): DbChain<Columns, R, Waits>
  oldest(column: string): DbChain<Columns, R, Waits>
  sort(...columns: string[]): DbChain<Columns, R, Waits>
  limit(n: number): DbChain<Columns, R, Waits>
  skip(n: number): DbChain<Columns, R, Waits>
  after(cursor: string | undefined): DbChain<Columns, R, Waits>
  pick<Name extends Extract<keyof R, string>>(columns: readonly Name[]): DbChain<Columns, Pick<R, Name>, Waits>
  all(): Answer<Waits, R[]>
  first(): Answer<Waits, R | undefined>
  count(): Answer<Waits, number>
}

/** A table of `db` that is read. */
interface DbRead<Columns, Waits> extends DbChain<Columns, RowOf<Columns>, Waits> {
  get(id: string): Answer<Waits, RowOf<Columns> | undefined>
  count(filter?: WrittenFilter<Columns>): Answer<Waits, number>
  history(id: string): Answer<Waits, { at: Date; by: string; value: RowOf<Columns> }[]>
  of(tenant: string): this
}

/** The values of a row as a write takes them: each may be left out, and `null` clears a column. */
type WriteValues<Columns> = { [Name in keyof GivenFields<Columns>]?: GivenFields<Columns>[Name] | null }

/** A table of `db` that is read and written, in a change and a seed. */
interface DbWrite<Columns> extends DbRead<Columns, false> {
  add(values: WriteValues<Columns>): RowOf<Columns>
  change(id: string, values: WriteValues<Columns>): RowOf<Columns>
  remove(id: string): void
}

type ReadTables<Waits> = { [Name in TableName]: DbRead<ColumnsOf<Tables[Name]>, Waits> }
type WriteTables = { [Name in TableName]: DbWrite<ColumnsOf<Tables[Name]>> }

/** What `db` holds beside the tables, where the code has full access: every row, raw SQL and the inside number of an id. */
interface FullAccess<Each, Waits> {
  system: Each
  sql(text: string, values?: readonly unknown[], o?: { of?: string }): Answer<Waits, unknown[]>
  n(table: string, id: string): Answer<Waits, number>
}

/** The `db` of a query: it reads, and answers at once. */
export type QueryDb = ReadTables<false> & FullAccess<ReadTables<false>, false>

/** The `db` of a change and of a seed: it reads and writes, and answers at once. */
export type ChangeDb = WriteTables & FullAccess<WriteTables, false>

/** The `db` of an action, a route and a flow: it reads, and every answer is a promise. */
export type ActionDb = ReadTables<true> & FullAccess<ReadTables<true>, true>

/**
 * What a `db` carries out of what is stored, for the program that holds it: a stored plan, and stored writes.
 * `resolve` is handed, whole, each value inside that is no literal, and answers what it stands for. Both pass the
 * same rules of a table as the members that code writes. The `db` that code is handed has neither.
 */
interface Carries {
  read(plan: PlanRecord, resolve?: (ref: object) => unknown): unknown
  write(writes: readonly Write[], resolve?: (ref: object) => unknown): unknown
}

/** The `db` of any context, as what makes one answers it. */
export type Db = (QueryDb | ChangeDb | ActionDb) & Carries
