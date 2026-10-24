# `headers` of `put`

The fields that are sent as headers, each under its name. It is stated on a call with the method PUT.

## Value

A record of header names by field name.

## Example

```ts
calls: { one: put('/v1/customers/{id}', { input: { id: text() }, headers: { key: 'Idempotency-Key' } }) }
```

## See also

`word.put`, `option.service.calls`
