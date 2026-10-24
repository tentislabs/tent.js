# `was` of `service`

The old name of the service, where it was renamed.

## Value

One name, or a list of names. It is always stored as a list. Left out, nothing is taken as a rename.

## Example

```ts
export const stripe = service('stripe', {
  url: 'https://api.stripe.com',
  was: 'payments',
})
```

## See also

`word.service`
