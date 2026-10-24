# `sends` of `put`

The builder's word on whether the call sends data out. It is stated on a call with the method PUT.

## Value

True or false. True where it is left out: an AI and an MCP caller ask a person before a call that sends.

## Example

```ts
calls: { one: put('/v1/customers/{id}', { input: { id: text() }, sends: false }) }
```

## See also

`word.put`, `option.service.calls`
