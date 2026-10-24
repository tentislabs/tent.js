# `pace` of `agent`

How the starts of the agent are paced, each part held for each key, as the `pace` of a flow: whoever starts it, a page, the API, MCP, a trigger, a step or a model's tool call.

## Value

`{ debounce, perMinute, drop, batch, order, turns }`, each as `option.flow.pace` gives it, with `order` an arrow over `{ input, event }`. A start that `drop` dropped answers `{ dropped: true }` and no run. Left out, every start goes at once.

## Example

```ts
export const helper = agent('helper', {
  model: writer,
  instructions: 'You sum the day up.',
  tools: [ordersOfDay],
  limits: { steps: 12, perRun: { tokensOut: 50000 } },
  pace: { drop: { max: 1, per: '1 hour' } },
})
```

## See also

`option.flow.pace`, `option.agent.key`, `word.agent`
