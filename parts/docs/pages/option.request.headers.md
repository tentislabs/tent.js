# `headers` of `request`

The fields that are sent as headers, each under its name. It is stated on a call of any method, which `request` names first.

## Value

A record of header names by field name.

## Example

```ts
calls: { one: request('HEAD', '/v1/charges/{id}', { input: { id: text() }, headers: { key: 'Idempotency-Key' } }) }
```

## See also

`word.request`, `option.service.calls`
