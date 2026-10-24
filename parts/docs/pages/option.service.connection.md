# `connection` of `service`

Another service whose connection this one uses.

## Value

The name of a service whose auth is `oauth`. Left out, the service keeps its own.

## Example

```ts
export const stripe = service('stripe', {
  url: 'https://api.stripe.com',
  connection: 'hooks',
})
```

## See also

`word.service`
