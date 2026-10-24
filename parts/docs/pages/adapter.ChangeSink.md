# `ChangeSink`

A continuous copy of the builder's own. It is handed every committed write of the app's tables, in order, with a number that grows by one, so a store elsewhere is kept one write behind.

## Interface

```ts
interface ChangeSink {
  start(n: number): number | { n: number; all: true } | Promise<number | { n: number; all: true }>
  wrote(change: {
    n: number
    at: number
    rows?: { table: string; kind: 'added' | 'changed' | 'removed'; row: Row }[]
    raw?: { text: string; values: unknown[] }[]
    layout?: TableStep[]
    file?: { table: string; id: string }
    gone?: { table: string; id: string }[]
    record?: Uint8Array
    by?: { caller: string; run?: string }
    tables?: string[]
    all?: true
    fetch?: true
  }): void | Promise<void>
  held?: true
  records?: true
  source?: () => Promise<Whole>
  renew?: (whole: Whole) => Promise<void>
}
```

`start` is told the number the data stands at, when the app opens and after the sink was closed, and answers the number the sink holds. Where the two differ, a write was committed and not handed on: a new backup is where the copy starts again. `wrote` is handed one write: the rows as they are stored, a `sealed` value sealed, and the vector of a vector column with its row, as a `Float32Array`, though the store keeps it apart from the row; for a raw SQL write its text and its values; for a table change its steps. A write that failed is handed again after `limits.sinkWait`, and then after six times that. While the sink is behind, what waits is kept up to `limits.sinkSize`; past that the sink is closed, and it is told where the data stands before it is handed a write again.

In an app that keeps a data file for each tenant, one count of writes runs over every file. A write of one tenant's file holds `file`: the table of the tenants, and the id of the tenant. The write that removes tenants holds `gone`, the list of them, since one write may remove more than one: the sink removes the rows of those tenants of the tenant tables.

A sink that states `records` is handed more with each write: `record`, the store's own record of it, which a store of the moment before applies to hold what the data holds; `by`, by whom it was made; `tables`, the tables its raw SQL stated, or `all` where they are not known; `fetch` for a tenant's file that was taken whole and that no record holds; and with each changed row what it held before. The store records every write for it, and the data keeps nothing of it. The archive of the engine is such a sink (`option.project.backups`).

The engine's own tables are not handed on, unless `start` answers `{ n, all: true }`. A write that touched those alone is then handed with no rows, so the numbers leave none out. `held`, `source` and `renew` are for a copy that is the place of record.

## Example

```ts
import type { ChangeSink } from 'tentjs/data'

let held = 0
export const sink: ChangeSink = {
  start: () => held,
  async wrote(change) {
    await fetch('https://copy.example.com/changes', { method: 'POST', body: JSON.stringify(change) })
    held = change.n
  },
}
```

## See also

`adapter.Store`, `adapter.Searcher`
