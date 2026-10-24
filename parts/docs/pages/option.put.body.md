# `body` of `put`

How the fields that are left are sent as the body. It is stated on a call with the method PUT.

## Value

`'json'` where it is left out, `'form'` for a form, `'files'` for a body in parts that carries a `file` as its bytes, or one field as the whole body: `{ text: 'payload', type: 'application/xml' }`, or `{ bytes: 'payload', type }`.

## Example

```ts
calls: { one: put('/v1/customers/{id}', { input: { id: text() }, body: 'form' }) }
```

## See also

`word.put`, `option.service.calls`
