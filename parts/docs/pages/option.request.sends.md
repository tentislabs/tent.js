# `sends` of `request`

The builder's word on whether the call sends data out. It is stated on a call of any method, which `request` names first.

## Value

True or false. True where it is left out: an AI and an MCP caller ask a person before a call that sends.

## Example

```ts
calls: { one: request('HEAD', '/v1/charges/{id}', { input: { id: text() }, sends: false }) }
```

## See also

`word.request`, `option.service.calls`
