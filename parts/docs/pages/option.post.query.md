# `query` of `post`

The fields that are written after the question mark of the address. It is stated on a call with the method POST.

## Value

A list of field names. For a `get` and a `del` every field that is left goes there all the same.

## Example

```ts
calls: { one: post('/v1/refunds', { input: { id: text() }, query: ['expand'] }) }
```

## See also

`word.post`, `option.service.calls`
