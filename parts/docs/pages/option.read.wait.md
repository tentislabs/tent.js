# `wait` of `read`

Whether the page waits for the entry before it is sent.

## Value

`false` sends the page without waiting for the entry: its name is nothing at first, and `calls.<name>.busy` is true until the answer arrives. It stands on an action and on a query that states `heavy`. Left out, the page waits, so the first HTML already holds the answer.

## Example

```tsx
data: { rates: read(currencyRates, { base: 'USD' }, { wait: false }) },
```

## See also

`word.read`, `option.query.heavy`
