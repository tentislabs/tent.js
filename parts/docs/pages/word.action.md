# `action`

A function that reaches outside: it may wait, call services and models, and write by calling a change.

## Example

```ts
export const sendNote = action('sendNote', {
  access: role('staff'),
  run: async ({ input }) => ({ ok: input.note.length > 0 }),
})
```

## Options

| Option | Means |
|---|---|
| `option.action.access` | Who may call the action. |
| `option.action.run` | The function that does the work. |
| `option.action.about` | One sentence on what the action is for. |
| `option.action.input` | The fields that a call gives. |
| `option.action.output` | The type of the answer. |
| `option.action.danger` | Whether AIs and MCP callers ask a person before the action runs. |
| `option.action.sends` | Whether the action sends data out. |
| `option.action.offer` | The outside doors the action is offered to. |
| `option.action.deprecated` | Marks the action as going away, in the API description and in its answers. |
| `option.action.system` | Gives the action full access, with the reason. |
| `option.action.background` | Runs the action off the main thread. |
| `option.action.worker` | The kind of worker the action runs on. |
| `option.action.batch` | Gathers calls of the action into one. |
| `option.action.remember` | Keeps the answers of the action for the same input. |
| `option.action.rows` | Plans whose rows the action is handed. |
| `option.action.uses` | The functions, service calls and members of handles that the code asks the writer for. |
| `option.action.changes` | The builder's word on whether the action writes in the store. |
| `option.action.callerGone` | What becomes of the work when its caller is gone. |
| `option.action.follow` | Who may follow the runs of the action from a page. |
| `option.action.countBy` | For whom the calls of the action are counted. |
| `option.action.limits` | The limits of the action. |
| `option.action.plain` | Holds the action to the plain form. |
| `option.action.was` | The old name of the action, where it was renamed. |

## Returns

A function that answers a promise. An action that states `follow` also gives the member `working`.

## Errors

`code.T0010`: it was called with no engine: nothing stands in the runtime slot.

## See also

`topic.words`
