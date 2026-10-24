# `args` of `command`

The flags of the command.

## Value

A record of types. Left out, the command takes none.

## Example

```ts
export const pay = command('pay', {
  run: async ({ args, terminal }) => {
    terminal.write(String(args.limit))
    return 0
  },
  args: { limit: number({ default: 20 }), since: date({ optional: true }), tags: list(text(), { optional: true }) },
})
```

## See also

`word.command`
