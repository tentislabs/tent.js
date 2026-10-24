# `access` of `command`

Who the command is for.

## Value

A rule. Everyone when left out.

## Example

```ts
export const pay = command('pay', {
  run: async ({ args, terminal }) => {
    terminal.write(String(args.limit))
    return 0
  },
  access: role('staff'),
})
```

## See also

`word.command`
