# `run` of `command`

The function of the command, which runs at the person's side.

## Value

A function that is handed `{ args, rest, terminal, user, signal, call, read, watch, follow, upload, download }` and answers the number the command ends with, or nothing for 0. It is required.

## Example

```ts
export const pay = command('pay', {
  run: async ({ args, terminal }) => {
    terminal.write(String(args.limit))
    return 0
  },
})
```

## See also

`word.command`
