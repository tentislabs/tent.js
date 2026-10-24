# `use` of `service`

The operations of the published description of `from` that become calls of the service.

## Value

A list of their `operationId`s, or a record from the name of a call to an operation: by its id, or by its method and its path where it has none, `use: { createRefund: 'POST /v1/refunds' }`. An id that is no name of ours, as `post-refunds`, needs such a key. Left out, none is read.

## Example

```ts
export const stripe = service('stripe', {
  url: 'https://api.stripe.com',
  from: './stripe.openapi.json',
  use: { refund: 'PostRefunds', charge: 'GetChargesCharge' },
})
```

## Errors

`code.T7013`: an operation that is not in the file, and two calls of one name.

## See also

`word.service`, `option.service.from`
