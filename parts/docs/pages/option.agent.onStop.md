# `onStop` of `agent`

The last work of a run of the agent that was stopped, as the `onStop` of a flow: it is carried out once, saved step by step, and the run is stopped once it has ended. It runs as the starter of the run.

## Value

An arrow that is handed `{ input, event, user, step, db, stopped }`, where `stopped` is `{ step, progress }`: the step that was at work, and what it kept of its progress. Left out, a run that is stopped ends at once.

## Example

```ts
export const booker = agent('booker', {
  model: writer,
  instructions: 'You book a trip.',
  tools: [bookFlight, bookHotel],
  limits: { steps: 12, perRun: { tokensOut: 50000 } },
  onStop: async ({ step }) => {
    await step('let go', () => releaseHolds({}))
  },
})
```

## See also

`option.flow.onStop`, `word.agent`
