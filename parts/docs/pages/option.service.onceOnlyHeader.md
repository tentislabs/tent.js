# `onceOnlyHeader` of `service`

The header in which the service takes a once-only key.

## Value

The name of the header. Left out, a repeat of a call inside a step is possible.

## Example

```ts
export const stripe = service('stripe', {
  url: 'https://api.stripe.com',
  onceOnlyHeader: 'Idempotency-Key',
})
```

## See also

`word.service`
