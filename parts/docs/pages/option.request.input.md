# `input` of `request`

The fields that the call is handed. It is stated on a call of any method, which `request` names first.

## Value

A record of types by name. A field that the path names in curly brackets is written there; left out, the call takes no input.

## Example

```ts
calls: { one: request('HEAD', '/v1/charges/{id}', { input: { id: text() } }) }
```

## See also

`word.request`, `option.service.calls`
