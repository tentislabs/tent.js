# `backfill`

A change that the engine hands every row of one table once, at the switch to the version that holds it: how the rows of an app are brought to what a new version needs.

## Example

```ts
export const splitNames = backfill('splitNames', {
  table: users,
  fills: 'first',
  run: (row, { db }) => {
    db.users.change(row.id, { first: row.fullName.split(' ')[0] })
  },
})
```

## Options

| Option | Means |
|---|---|
| `option.backfill.table` | The table whose rows it is handed. |
| `option.backfill.run` | What it does with one row. |
| `option.backfill.page` | How many rows one write takes. |
| `option.backfill.fills` | The column it fills, which the same version may make required. |
| `option.backfill.system` | The reason it has full access, where it needs `db.system` or `db.sql`. |
| `option.backfill.was` | The old name of the backfill, where it was renamed. |

## Returns

The definition, which records its options. At the switch to its version, on the writer, the engine carries it out once over every row of its table, by the one walk of a switch, a page at a time: each page is one write as the system, which moves the note of the backfill in that file, `walk.<name>` of `_t_meta`, on to the last row it walked, so a stop goes on from where it stood. Over a table of the shared file it runs before the version answers. Over a tenant table it runs in the pass that brings each file of a tenant up, so no file is read by the version before it ran there, and a file that the version makes is marked done at once: its rows were written by the version. A column that it fills is required in a file once it ran in that file. It is marked done in each file in the write of its last page, so it never runs twice on a row and never again in a file. A reader runs none of it: it is handed the rows as changes. It is a change: the rules of a write, the triggers and the kept counts hold for it as for any change.

## Errors

`code.T2001`: a column that it fills, and that its version makes required, still holds nothing in a row once it ran.

## See also

`topic.words`, `word.table`
