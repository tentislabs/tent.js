# `kept` of `table`

Where the rows of the table live: `'memory'` keeps them in the writer's memory alone, for what is true now and needs no keeping, as who is at which document and who is typing.

## Value

`'memory'`. Left out, the rows live in the data file, as every table's do.

A table kept in memory is written by changes and read by queries under its own rules, like every table, and is live to every page that reads it. Each row is gone `lasts` after its last write (`option.table.lasts`). Its rows are in no data file, no backup, no part of the archive, no export of a person and no sink, and they are gone when the program stops: it is no place for data that must stay. It holds no search, no row history, no vector and no file for each tenant, and no table may link to it (`code.T2027`); its own links to rows that stay are kept as their ids. A query of it runs on the writer's main thread, where its rows are: `heavy` does not move it, and the check notes one (`code.T2030`). A reader is handed its rows on the link, those the writer holds as the reader joins and each write after, in no record, and answers them as the writer does. What it costs is the writer's memory alone.

## Example

```ts
export const presence = table('presence', {
  kept: 'memory',
  lasts: '30 seconds',
  columns: { user: link('users', { onRemove: 'remove' }), doc: text(), typing: boolean({ default: false }) },
  access: { read: 'signedIn', add: 'signedIn', change: 'signedIn' },
})
```

## Errors

`code.T1014`: a value that is not `'memory'`, and what a table kept in memory cannot hold. `code.T2027`: a link to it from another table.

## See also

`word.table`, `option.table.lasts`
