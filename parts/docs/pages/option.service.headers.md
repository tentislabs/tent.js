# `headers` of `service`

Lines that every request of the service carries.

## Value

A record of text, each value a literal or a secret. Left out, a request carries only its own lines.

## Example

```ts
export const stripe = service('stripe', {
  url: 'https://api.stripe.com',
  headers: { 'Stripe-Version': '2026-06-30' },
})
```

## See also

`word.service`
