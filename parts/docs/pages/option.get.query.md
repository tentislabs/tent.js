# `query` of `get`

The fields that are written after the question mark of the address. It is stated on a call with the method GET.

## Value

A list of field names. For a `get` and a `del` every field that is left goes there all the same.

## Example

```ts
calls: { one: get('/v1/charges/{id}', { input: { id: text() }, query: ['expand'] }) }
```

## See also

`word.get`, `option.service.calls`
