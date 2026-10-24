# `Searcher`

A search of the builder's own, in place of the store's text search. It is told the text of every row that is written, and answers the ids for some words.

## Interface

```ts
interface Searcher {
  has(table: string): boolean
  wrote(table: string, id: string, texts: Record<string, string> | undefined, of?: { table: string; id: string }): void
  find(table: string, words: string, limit: number, of?: { table: string; id: string }): string[]
  gone?(of: { table: string; id: string }): void
}
```

`wrote` is called after a write is committed, with the texts of the row in the columns its table is searched by, and with no texts for a removed row. A write that was undone tells it nothing. When the app opens it is asked with `has` which tables it holds, and is handed every row of one it does not. `find` answers at once, the ids in the order the rows are to come. The rows are then read under the table's rules, so a search of the builder's own never shows a row the caller may not read: `find` is asked for as many ids as the plan's `limit`, and for twice as many again while too few of them pass and it has more. With a `Searcher` connected the store keeps no index of its own, and no trigger for one, so every search goes to it: for a count, a group, a page and a search with a stated order it is asked for all that it finds, twice as many again while it has more.

For a table that keeps a data file for each tenant, `wrote` and `find` are handed the tenant last, as `of`: the table of the tenants, and the id of the tenant. A search then answers the ids of that tenant alone. `gone` is told of a tenant that was removed, so that its texts are let go.

## Example

```ts
import type { Searcher } from 'tentjs/data'

const texts = new Map<string, string>()
export const searcher: Searcher = {
  has: () => false,
  wrote: (table, id, row) => (row ? texts.set(`${table} ${id}`, Object.values(row).join(' ')) : texts.delete(`${table} ${id}`)),
  find: (table, words, limit) =>
    [...texts].filter(([key, text]) => key.startsWith(`${table} `) && text.includes(words)).map(([key]) => key.split(' ')[1]).slice(0, limit),
}
```

## See also

`adapter.Store`
