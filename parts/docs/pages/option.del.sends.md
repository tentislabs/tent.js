# `sends` of `del`

The builder's word on whether the call sends data out. It is stated on a call with the method DELETE.

## Value

True or false. True where it is left out: an AI and an MCP caller ask a person before a call that sends.

## Example

```ts
calls: { one: del('/v1/customers/{id}', { input: { id: text() }, sends: false }) }
```

## See also

`word.del`, `option.service.calls`
