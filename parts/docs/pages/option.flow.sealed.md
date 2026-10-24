# `sealed` of `flow`

Seals what every step of the flow saves with the key of the secrets, so that a card number or a token a step answers stands nowhere in the data as it is.

## Value

`true`. Left out, a step is sealed only where it states `sealed: true` itself: `step('card', work, { sealed: true })`.

A sealed result is bound to its run, its step and its repeat, as a sealed column is to its row. The data file, a backup of it, a machine without the key, `runs.read` and another run hold the sealed text alone; the run that saved it reads it back opened, on every pass; a person's export opens the steps of the runs that ran as them. The run's answer is not sealed: what a flow answers is its own word.

## Example

```ts
export const charge = flow('charge', {
  input: { card: text() },
  sealed: true,
  run: async ({ input, step }) => {
    const kept = await step('card', () => ({ card: input.card }))
    await step.wait('1 hour')
    await step('use', () => chargeCard({ card: kept.card }))
  },
})
```

## Errors

`code.T0019`: no key of the secrets is at hand, or a sealed result does not open for its step.

## See also

`word.flow`, `topic.flows`, `command.secrets`
