# `change`

The only thing that writes a caller's data. It is written with `set`, one write or a list, or with `run`, whose whole is one all-or-nothing write.

## Example

```ts
export const addNote = change('addNote', {
  access: 'signedIn',
  set: notes.add({ body: input('body') }),
})
```

## Options

| Option | Means |
|---|---|
| `option.change.access` | Who may call the change. |
| `option.change.set` | The writes of the change, as plain data. |
| `option.change.run` | The function that makes the change. |
| `option.change.about` | One sentence on what the change is for. |
| `option.change.input` | The fields that a call gives. |
| `option.change.output` | The type of the answer. |
| `option.change.danger` | Whether AIs and MCP callers ask a person before the change runs. |
| `option.change.offer` | The outside doors the change is offered to. |
| `option.change.deprecated` | Marks the change as going away, in the API description and in its answers. |
| `option.change.system` | Gives the change full access, with the reason. |
| `option.change.touches` | The tables that a raw SQL write of the change writes. |
| `option.change.countBy` | For whom the calls of the change are counted. |
| `option.change.everywhere` | Answers the change only once every machine of the app holds it. |
| `option.change.plain` | Holds the change to the plain form. |
| `option.change.was` | The old name of the change, where it was renamed. |

## Returns

A function, `markPaid(input)`, which answers at once. A call is handed to the engine.

## Errors

`code.T0010`: it was called with no engine: nothing stands in the runtime slot.

## See also

`topic.words`
