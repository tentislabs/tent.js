# `onStop` of `flow`

What is carried out when a run is stopped, as its last work, so that it can take back what was half done.

## Value

A function that is handed what `run` is handed, and `stopped`: `{ step, progress }`, the step that was at work when the run was stopped - the one that began last and had not ended - and what that step kept with `progress`. Left out, a stop ends the run at once.

It is carried out once, whether the run was stopped by `runs.stop`, `tent runs stop`, `runs.stopAll` or `stopOn`, and its steps are saved like any, under their names with `onStop.` in front, so a restart in its middle goes on from its last saved step. It has the flow's `limits.time` of its own, counted anew. The run stays `running` while it works, and is `stopped` in the write that ends it, whatever it ends with; a caller that waits for the run is answered `code.T5106` then. A second stop ends it at once.

## Example

```ts
export const trip = flow('trip', {
  input: { name: text() },
  run: async ({ input, step }) => {
    await step('seat', () => bookSeat({ name: input.name }))
    await step('room', async ({ progress }) => {
      await progress({ booked: 'half' })
      return bookRoom({ name: input.name })
    })
  },
  onStop: async ({ input, stopped, step }) => {
    if (stopped.step === 'room') await step('undo', () => cancelRoom({ name: input.name }))
  },
})
```

## See also

`option.flow.onFail`, `option.flow.stopOn`, `word.flow`, `topic.flows`
