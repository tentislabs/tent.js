# `changes` of `patch`

The builder's word on whether the call changes anything at the service. It is stated on a call with the method PATCH.

## Value

True or false. Left out, a `get` changes nothing and every other method changes something.

## Example

```ts
calls: { one: patch('/v1/customers/{id}', { input: { id: text() }, changes: false }) }
```

## See also

`word.patch`, `option.service.calls`
