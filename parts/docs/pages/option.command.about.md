# `about` of `command`

One sentence on what the command is for, which the help prints.

## Value

Text. Left out, the command has no sentence.

## Example

```ts
export const pay = command('pay', {
  about: 'Walks through the notes',
  run: async ({ args, terminal }) => {
    terminal.write(String(args.limit))
    return 0
  },
})
```

## See also

`word.command`
