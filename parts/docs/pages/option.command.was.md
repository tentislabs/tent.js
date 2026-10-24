# `was` of `command`

The old name of the command, where it was renamed.

## Value

One name, or a list of names. It is always stored as a list. Left out, nothing is taken as a rename.

## Example

```ts
export const pay = command('pay', {
  run: async ({ args, terminal }) => {
    terminal.write(String(args.limit))
    return 0
  },
  was: 'payNotes',
})
```

## See also

`word.command`
