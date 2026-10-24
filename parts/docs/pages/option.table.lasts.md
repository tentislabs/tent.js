# `lasts` of `table`

How long a row of the table lasts: past it, the row is removed. One word for a table that stays and for a table kept in memory.

## Value

A length of time, as `'90 days'`, counted from the last write of each row: each write of a row, a change among them, starts its time anew. Or, for a table that stays, `{ for, by, where }`: `for` is the length of time; `by` names the moment a row is counted from, a `date` column of the table, `createdAt` or `updatedAt`, and the last write where it is left out; `where` is a filter, as a record, that names the rows it holds for, and every row where it is left out. Left out, every row stays until it is removed.

In a table that stays, the engine removes the rows past their age once a day, a page of `limits.workPage` rows to a write, as the system: each removal follows each link's `onRemove`, starts the triggers of a removal, and reaches the readers, as any removal does. A row that a link with `onRemove: 'refuse'` holds is left, and the log names it. For a tenant table it is done in the file of each tenant. In the mode `development` nothing is removed, unless `tent dev --keep` asks for it. The rows of an agent's memory and conversations are rows of tables of the app's own, kept for a time the same way.

In a table kept in memory (`option.table.kept`), `lasts` is a length of time alone. A read never answers a row past its time, and the writer takes it away soon after, in a write that every page which reads the table is told of.

## Example

```ts
export const visits = table('visits', {
  columns: { page: text(), at: date() },
  lasts: { for: '90 days', by: 'at' },
})
```

```ts
export const typing = table('typing', { kept: 'memory', lasts: '5 seconds', columns: { user: link('users'), doc: text() } })
```

## Errors

`code.T1014`: a length that does not read, a `by` that names no moment of the table, and on a table kept in memory a `lasts` that is no length of time alone.

## See also

`word.table`, `option.table.kept`, `command.dev`
