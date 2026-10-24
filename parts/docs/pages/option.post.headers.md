# `headers` of `post`

The fields that are sent as headers, each under its name. It is stated on a call with the method POST.

## Value

A record of header names by field name.

## Example

```ts
calls: { one: post('/v1/refunds', { input: { id: text() }, headers: { key: 'Idempotency-Key' } }) }
```

## See also

`word.post`, `option.service.calls`
