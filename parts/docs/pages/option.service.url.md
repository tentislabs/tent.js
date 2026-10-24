# `url` of `service`

Where the service is.

## Value

An address, to which the path of every call is joined. It is required, but for a server that is a program.

## Example

```ts
export const stripe = service('stripe', {
  url: 'https://api.stripe.com',
})
```

## See also

`word.service`
