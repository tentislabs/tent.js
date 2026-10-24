# `calls` of `service`

The calls of the service, each written with `get`, `post`, `put`, `patch`, `del`, or `request` for another method.

## Value

A record of calls by name. Left out, the service has the calls that `from` reads. Each takes `{ input, output, body, query, headers, lists, files, sends, changes, about }`.

A field of the input that the path names in curly brackets is written there, as one part of the address. A field that `query` names, and for a `get` and a `del` every other field, is written after the question mark, a list by `lists`: `'repeat'` (the default), `'brackets'` or `'comma'`. A field that `headers` names is sent as that header. Every field that is left is the body: JSON by default, `'form'` for a form, `'files'` for a body in parts that carries a `file` as its bytes, or one field as the whole body, `{ text: 'payload', type: 'application/xml' }`. A field with no value is left out. A request carries `Content-Type` by its body, `Accept: application/json` unless `output` is a file, and `User-Agent: tentjs/<version>`.

## Example

```ts
export const stripe = service('stripe', {
  url: 'https://api.stripe.com',
  calls: {
    createRefund: post('/v1/refunds', { input: { charge: text() }, output: object({ id: text() }), body: 'form', about: 'Refunds a charge' }),
    getCharge: get('/v1/charges/{id}', { input: { id: text(), expand: list(text(), { optional: true }) }, lists: 'brackets' }),
  },
})
```

## Errors

`code.T1014`: a value that the call cannot write where it puts it, as a list in the path. `code.T2104`: a file of the input that the caller may not download.

## See also

`word.service`, `word.post`, `word.request`
