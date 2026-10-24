# `headers` of `get`

The fields that are sent as headers, each under its name. It is stated on a call with the method GET.

## Value

A record of header names by field name.

## Example

```ts
calls: { one: get('/v1/charges/{id}', { input: { id: text() }, headers: { key: 'Idempotency-Key' } }) }
```

## See also

`word.get`, `option.service.calls`
