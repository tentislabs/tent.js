# `body` of `request`

How the fields that are left are sent as the body. It is stated on a call of any method, which `request` names first.

## Value

`'json'` where it is left out, `'form'` for a form, `'files'` for a body in parts that carries a `file` as its bytes, or one field as the whole body: `{ text: 'payload', type: 'application/xml' }`, or `{ bytes: 'payload', type }`.

## Example

```ts
calls: { one: request('HEAD', '/v1/charges/{id}', { input: { id: text() }, body: 'form' }) }
```

## See also

`word.request`, `option.service.calls`
