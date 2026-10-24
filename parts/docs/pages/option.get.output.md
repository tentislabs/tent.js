# `output` of `get`

The type of the answer of the call. It is stated on a call with the method GET.

## Value

A type. Left out, the answer is handed on as the service sent it.

## Example

```ts
calls: { one: get('/v1/charges/{id}', { input: { id: text() }, output: object({ id: text() }) }) }
```

## See also

`word.get`, `option.service.calls`
