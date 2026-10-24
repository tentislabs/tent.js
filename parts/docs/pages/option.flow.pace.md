# `pace` of `flow`

How the starts of the flow are paced: a burst of starts waits, is gathered, or is dropped, each part held per key (`option.flow.key`), so that ten quick changes of one row make one run and a flood of starts never outruns what a service bears.

## Value

A record of the parts the flow needs. Left out, each start is a run at once. Every start is held to it, whoever starts it: a page, the API, a trigger, a step and a call alike. A run that `step.again` starts is no new start, and is held to no pace.

| Part | Does |
|---|---|
| `debounce: '30 seconds'` | A start waits until no start of the same key came for that long, and then one run starts, with the last start's input and event, as a filled value settles |
| `perMinute: 10` | At most that many runs of a key start in a minute, as a service's `perMinute` counts its calls; the rest wait their turn, in their order |
| `drop: { max: 1, per: '1 hour' }` | At most `max` runs of a key start in that time; every other start is dropped, and each drop is a line of the log. A dropped start answers `{ dropped: true }` and no run: `start` answers it, and a call of the flow is answered it and waits for nothing |
| `batch: { max: 100, wait: '10 seconds' }` | Starts of a key are gathered, and one run starts once `max` of them came or the first has waited `wait`, ten seconds where it is left out. The run is handed `events`, a list of the event of each start in its order: for a start with no event, `{ kind: 'start', input }`. Its `input` is the input of the last start |
| `order: ({ input, event }) => number` | Among the starts that wait their turn, the higher goes first, as `order` says which task of a kind goes first |
| `turns: 'key'` | Among the starts that wait their turn with the same `order`, the keys take turns, so one key's backlog never holds the others up, as `turns: 'caller'` does for tasks |

A flow that a table trigger starts and that states no `key` paces each row by its id. A start that waits is a row of the runs, `queued`, written in the write that started it, so a restart loses none; the next start of its key moves it on in its own write. `order` and `turns` order the starts that wait, for whatever they wait: `perMinute`, `debounce`, `together` of their key (`option.flow.together`), or a pause of the flow.

## Example

```ts
export const noted = flow('noted', {
  on: orders.changed(),
  pace: { debounce: '30 seconds' },
  run: async ({ event, step }) => {
    await step('note', () => noteOrder({ order: event.row.id }))
  },
})

export const synced = flow('synced', {
  input: { customer: text() },
  key: ({ input }) => input.customer,
  pace: { perMinute: 10, turns: 'key' },
  run: async ({ input, step }) => {
    await step('send', () => sendCustomer({ customer: input.customer }))
  },
})
```

## Errors

`code.T1003`: `pace` holds a part that is none of these. `code.T1011`: a length of time that does not read.

## See also

`option.flow.key`, `option.flow.together`, `word.flow`, `topic.flows`
