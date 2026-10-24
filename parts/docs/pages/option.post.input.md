# `input` of `post`

The fields that the call is handed. It is stated on a call with the method POST.

## Value

A record of types by name. A field that the path names in curly brackets is written there; left out, the call takes no input.

## Example

```ts
calls: { one: post('/v1/refunds', { input: { id: text() } }) }
```

## See also

`word.post`, `option.service.calls`
