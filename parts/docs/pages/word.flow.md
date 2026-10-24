# `flow`

Work that is saved step by step, so that it waits, is tried again and goes on after a restart.

## Example

```ts
export const tidy = flow('tidy', {
  run: async ({ input, step }) => {
    await step('count', () => countNotes())
    return { team: input.team }
  },
})
```

## Options

| Option | Means |
|---|---|
| `option.flow.run` | The function of the flow, which is run from its top on every pass. |
| `option.flow.on` | What starts the flow. |
| `option.flow.key` | What a run is about, by which a start joins it and an event stops it. |
| `option.flow.stopOn` | The events that stop the runs of a key. |
| `option.flow.pace` | How a burst of starts waits, is gathered or is dropped, for each key. |
| `option.flow.sealed` | Seals what every step of the flow saves. |
| `option.flow.about` | One sentence on what the flow is for. |
| `option.flow.input` | The fields that a start gives. |
| `option.flow.output` | The type of the answer of the flow. |
| `option.flow.limits` | The limits of a run. |
| `option.flow.tries` | How often a step is tried in all. |
| `option.flow.together` | How many runs of the flow may work at once. |
| `option.flow.moveRuns` | Whether a waiting run is moved to a new version. |
| `option.flow.onFail` | What is carried out when a run fails for good. |
| `option.flow.onStop` | What is carried out when a run is stopped, to take back what was half done. |
| `option.flow.as` | Whose rights a run has. |
| `option.flow.danger` | Whether the flow, used as a tool, asks a person first. |
| `option.flow.offer` | The outside doors the flow is offered to. |
| `option.flow.access` | Who may call the flow through the door. |
| `option.flow.system` | The reason why an offered flow has full access. |
| `option.flow.sends` | Whether the flow sends data out. |
| `option.flow.follow` | Who may follow the runs of the flow from a page. |
| `option.flow.countBy` | For whom the runs of the flow are counted. |
| `option.flow.plain` | Holds the flow to the plain form. |
| `option.flow.was` | The old name of the flow, where it was renamed. |

## Returns

In an action, a route or a step, a function that starts a run, waits for it and answers the flow's answer. A flow that states `follow` also gives the member `working`.

## Errors

`code.T0010`: it was called with no engine: nothing stands in the runtime slot.

## See also

`topic.words`, `word.start`
