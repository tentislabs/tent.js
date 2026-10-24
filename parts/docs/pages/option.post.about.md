# `about` of `post`

One sentence on what the call is for. It is stated on a call with the method POST.

## Value

A text. It is shown to an AI that is given the call as a tool.

## Example

```ts
calls: { one: post('/v1/refunds', { input: { id: text() }, about: 'Reads one charge' }) }
```

## See also

`word.post`, `option.service.calls`
