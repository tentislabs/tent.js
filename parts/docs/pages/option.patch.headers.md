# `headers` of `patch`

The fields that are sent as headers, each under its name. It is stated on a call with the method PATCH.

## Value

A record of header names by field name.

## Example

```ts
calls: { one: patch('/v1/customers/{id}', { input: { id: text() }, headers: { key: 'Idempotency-Key' } }) }
```

## See also

`word.patch`, `option.service.calls`
