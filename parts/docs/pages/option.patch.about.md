# `about` of `patch`

One sentence on what the call is for. It is stated on a call with the method PATCH.

## Value

A text. It is shown to an AI that is given the call as a tool.

## Example

```ts
calls: { one: patch('/v1/customers/{id}', { input: { id: text() }, about: 'Reads one charge' }) }
```

## See also

`word.patch`, `option.service.calls`
