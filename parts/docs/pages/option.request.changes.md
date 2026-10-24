# `changes` of `request`

The builder's word on whether the call changes anything at the service. It is stated on a call of any method, which `request` names first.

## Value

True or false. Left out, a call with the method GET changes nothing, and one of any other method, HEAD among them, changes something.

## Example

```ts
calls: { one: request('HEAD', '/v1/charges/{id}', { input: { id: text() }, changes: false }) }
```

## See also

`word.request`, `option.service.calls`
