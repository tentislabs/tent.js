# `input` of `put`

The fields that the call is handed. It is stated on a call with the method PUT.

## Value

A record of types by name. A field that the path names in curly brackets is written there; left out, the call takes no input.

## Example

```ts
calls: { one: put('/v1/customers/{id}', { input: { id: text() } }) }
```

## See also

`word.put`, `option.service.calls`
