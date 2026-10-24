# `now`

The moment of the call that is under way: one moment for the whole of a query, a change and a seed, and the present moment in an action and inside a step.

## Example

```ts
set: orders.change(input('order'), { paidAt: now() })
```

## Returns

The moment, which it asks the engine for. Where a definition is being made it answers its record, `{ "now": true }`, which is worked out when the definition is carried out.

## See also

`topic.values`, `word.later |`
