# `Store`

The small interface through which the data part talks to storage. The store that ships is the runtime's own SQLite, and a builder may put another in its place.

## Interface

```ts
interface Store {
  open(folder: string, o?: { readOnly?: boolean; lazy?: boolean }): void
  close(): void
  read(plan: StorePlan, caller: Caller): { value: Rows | Row | number | undefined; tables: string[] }
  write<T>(fn: (tx: Tx) => T, o?: { steps?: boolean; toDisk?: boolean }): { value: T; touched: { table: string; ids: string[] }[] }
  begin?(o?: { steps?: boolean; toDisk?: boolean }): { tx: Tx; commit(): { touched: { table: string; ids: string[] }[] }; undo(error?: unknown): void }
  layout(): TableLayout[]
  applyTableChanges(steps: TableStep[]): void
  snapshot(toFile: string): Promise<{ n: number }>
  forget(table: string): void
  sql?(text: string, values: unknown[]): unknown[]
  version(): { engine: string; layout: number }
  copy?: { keep(): void; record(): Bytes; apply(record: Bytes, rows?: Wrote[]): void }
}
interface Tx {
  read(plan: StorePlan, caller: Caller): unknown
  add(table: string, values: Row, caller: Caller): Row
  change(table: string, id: RowKey, values: Row, caller: Caller): Row
  remove(table: string, id: RowKey, caller: Caller): void
  sql(text: string, values: unknown[], touches?: string[]): unknown[]
  sqlRead(text: string, values: unknown[]): unknown[]
}
type StorePlan = Plan & { linked?: Record<string, Filter | false> }
```

A store lives inside the program: its reads answer at once. It speaks text ids only, in plans, in what it answers and in `touched`. It applies no access rule: each rule is already written into the plan as a filter. `linked` of a plan holds, for each table that a sort or a group reads through a link, the filter of the caller's rule, or `false` where the caller reads no row of it: a linked row that it leaves out is read as a row with no value. `read` reports the tables it read, and `write` what it touched. A write with `toDisk` has reached the disk when it answers. `sql` is offered by a store that is SQL, for a raw read outside a write, and `sqlRead` of a write runs a text that may only read.

Two members are for a store that does more. `begin` begins a write that whoever began it ends, by `commit` or by `undo`: a store without it keeps no data file for each tenant. `copy` is what a store gives to run on many machines: `keep` tells it to record every write from now on, `record` answers its own record of the write that is under way, and `apply` puts one record into a store that holds every write before it. A store without it has no readers.

## Example

```ts
import { sqliteStore, type Store } from 'tentjs/data'

const store: Store = sqliteStore()
store.open('.tent')
const { value, tables } = store.read({ from: 'orders', limit: 10 }, { kind: 'system' })
store.close()
```

## See also

`code.T0012`, `code.T0013`, `adapter.ChangeSink`
