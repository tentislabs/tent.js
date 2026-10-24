# `about` of `request`

One sentence on what the call is for. It is stated on a call of any method, which `request` names first.

## Value

A text. It is shown to an AI that is given the call as a tool.

## Example

```ts
calls: { one: request('HEAD', '/v1/charges/{id}', { input: { id: text() }, about: 'Reads one charge' }) }
```

## See also

`word.request`, `option.service.calls`
