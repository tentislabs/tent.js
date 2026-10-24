# `input` of `get`

The fields that the call is handed. It is stated on a call with the method GET.

## Value

A record of types by name. A field that the path names in curly brackets is written there; left out, the call takes no input.

## Example

```ts
calls: { one: get('/v1/charges/{id}', { input: { id: text() } }) }
```

## See also

`word.get`, `option.service.calls`
