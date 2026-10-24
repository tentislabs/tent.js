# `command`

A command of the app's own command line that is written in code. It is a helper word, written in a file that imports `tentjs/cli`.

## Example

```ts
export const pay = command('pay', {
  run: async ({ args, terminal }) => {
    terminal.write(String(args.limit))
    return 0
  },
})
```

## Options

| Option | Means |
|---|---|
| `option.command.about` | One sentence on what the command is for, which the help prints. |
| `option.command.run` | The function of the command, which runs at the person's side. |
| `option.command.access` | Who the command is for. |
| `option.command.args` | The flags of the command. |
| `option.command.was` | The old name of the command, where it was renamed. |

## Returns

A record that carries its options. Nothing calls it.

## See also

`topic.words`
