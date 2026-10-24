# `together` of `flow`

How many runs of the flow may work at once, counted for each key where the flow has one (`option.flow.key`), and what becomes of a start over that.

## Value

`{ max, group, then }`. Left out, `max` is 10 and a run over it waits.

- `max`: how many runs may work at once, for each key where the flow states `key`, or, for a flow that a table trigger starts, for each row. Only a run that works counts: one that waits does not.
- `group`: a name that several flows state, so that their runs are counted together: `{ group: 'perTeam', max: 5 }` on two flows whose `key` is the team lets five runs of either work at once for one team, and a run of another team goes its own way.
- `then`: what becomes of a start when as many runs work as `max` allows. `'wait'`, the default, lets it wait its turn, in its order. `'refuse'` refuses it with `code.T7103`. `'stop'` stops the run that has worked longest and starts this one. `'join'` answers a start whose key already has a run that has not ended with that run, and starts nothing, so a webhook that is sent three times, or a button that is pressed twice, makes one run: `start` answers `{ run }` of that run, and a call of the flow waits for it. Each start that joined is a line of the log.

A start joins a run only where the same caller started that run, or where the system starts it: to any other caller the start is refused with `code.T7103`, and nothing of the run is told. A key is a caller of its own, so a start from the API joins a run that the same key started.

It holds whoever starts the flow: a page, the API, MCP, the app's own command line, a trigger, a step, and a model's tool call. A flow that joins says so in its line where it is a tool, and a model's call that joins is answered what the run it joined answers.

## Example

```ts
export const ship = flow('ship', {
  input: { order: text() },
  key: ({ input }) => input.order,
  together: { then: 'join' },
  run: async ({ input, step }) => {
    await step('pack', () => packOrder({ order: input.order }))
  },
})
```

## Errors

`code.T7103`: a start over `max` of a flow that states `then: 'refuse'`, and a start that would join the run of another caller.

## See also

`option.flow.key`, `word.flow`
