# `about` of `del`

One sentence on what the call is for. It is stated on a call with the method DELETE.

## Value

A text. It is shown to an AI that is given the call as a tool.

## Example

```ts
calls: { one: del('/v1/customers/{id}', { input: { id: text() }, about: 'Reads one charge' }) }
```

## See also

`word.del`, `option.service.calls`
