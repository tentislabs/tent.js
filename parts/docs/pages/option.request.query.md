# `query` of `request`

The fields that are written after the question mark of the address. It is stated on a call of any method, which `request` names first.

## Value

A list of field names. For the methods GET, DELETE and HEAD every field that is left goes there all the same.

## Example

```ts
calls: { one: request('HEAD', '/v1/charges/{id}', { input: { id: text() }, query: ['expand'] }) }
```

## See also

`word.request`, `option.service.calls`
