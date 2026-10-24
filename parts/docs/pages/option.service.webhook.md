# `webhook` of `service`

How the service signs what it sends.

## Value

`{ scheme, secret }`. It is what `signature` of the service stands for. Left out, the service has no signature.

## Example

```ts
export const stripe = service('stripe', {
  url: 'https://api.stripe.com',
  webhook: { scheme: 'stripe', secret: secret('STRIPE_HOOK') },
})
```

## See also

`word.service`
