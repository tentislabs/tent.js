# `output` of `post`

The type of the answer of the call. It is stated on a call with the method POST.

## Value

A type. Left out, the answer is handed on as the service sent it.

## Example

```ts
calls: { one: post('/v1/refunds', { input: { id: text() }, output: object({ id: text() }) }) }
```

## See also

`word.post`, `option.service.calls`
