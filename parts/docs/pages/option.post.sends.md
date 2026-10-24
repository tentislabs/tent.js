# `sends` of `post`

The builder's word on whether the call sends data out. It is stated on a call with the method POST.

## Value

True or false. True where it is left out: an AI and an MCP caller ask a person before a call that sends.

## Example

```ts
calls: { one: post('/v1/refunds', { input: { id: text() }, sends: false }) }
```

## See also

`word.post`, `option.service.calls`
