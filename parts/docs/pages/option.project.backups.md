# `backups` of `project`

When backups of the data are taken, how many are kept, and where the archive of every change lies.

## Value

`{ every, keep, beforeChanges, test, archive, store }`. Left out, one is taken each day and before a table change, seven are kept, each is test-restored, and every change is archived beside them.

- `archive`: `false` turns the archive off. With it on, the engine keeps every committed change of every data file, in order, cut into parts of `limits.archivePart` (4 MB), each named by the number of its first change and its time. It reaches back as far as the oldest backup that is kept, and it is what `tent data restore --at` reads. It holds the record of each change as the store wrote it, so a sealed value stands in it sealed, and it holds no secret. Beside the record it holds only what `undo` needs and the record does not give: who made the change, and of each row of the app its id, what a row that was set held before, and a row that was removed as it was.
- `store`: a store of files, `s3(...)`, in which the archive lies, with a copy of every backup beside it, so that a lost disk keeps both. Left out, the archive lies in `backups/archive/` of the data folder.

Each change is added to the file of the part that is open, `backups/archive/open.part`, as it comes, so a stop of the program loses nothing that reached it. A part is closed and sent once it is full and when the app is closed, and a part that a stop left open is sent when the app opens again, with the changes it holds whole: a change that the stop cut off in the middle never reached it. A write whose change a stop caught between its commit and the archive never reached it: when the app opens and holds writes past the last change of the archive, the engine takes a backup at once and writes that gap into the archive's list. A restore to a moment in the gap, and an undo that reaches into it, is refused with `code.T0009`, which names it; a moment before it, and after that backup, is reached. A person's removal reaches the archive as it reaches the backups: the parts and the backups made before still hold the person until they age out.

## Example

```ts
export const shop = project('shop', {
  backups: {
    every: '1 day',
    keep: 14,
    store: s3({ url: 'https://storage.example.com', bucket: 'shop-backups', key: secret('STORE_KEY') }),
  },
})
```

## See also

`word.project`, `word.s3`, `command.data`, `option.project.limits`
