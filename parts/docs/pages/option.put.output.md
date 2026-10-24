# `output` of `put`

The type of the answer of the call. It is stated on a call with the method PUT.

## Value

A type. Left out, the answer is handed on as the service sent it.

## Example

```ts
calls: { one: put('/v1/customers/{id}', { input: { id: text() }, output: object({ id: text() }) }) }
```

## See also

`word.put`, `option.service.calls`
