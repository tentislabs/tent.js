# `about` of `get`

One sentence on what the call is for. It is stated on a call with the method GET.

## Value

A text. It is shown to an AI that is given the call as a tool.

## Example

```ts
calls: { one: get('/v1/charges/{id}', { input: { id: text() }, about: 'Reads one charge' }) }
```

## See also

`word.get`, `option.service.calls`
