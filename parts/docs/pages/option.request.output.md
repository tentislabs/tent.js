# `output` of `request`

The type of the answer of the call. It is stated on a call of any method, which `request` names first.

## Value

A type. Left out, the answer is handed on as the service sent it.

## Example

```ts
calls: { one: request('HEAD', '/v1/charges/{id}', { input: { id: text() }, output: object({ id: text() }) }) }
```

## See also

`word.request`, `option.service.calls`
