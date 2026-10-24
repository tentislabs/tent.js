# `changes` of `del`

The builder's word on whether the call changes anything at the service. It is stated on a call with the method DELETE.

## Value

True or false. Left out, a `get` changes nothing and every other method changes something.

## Example

```ts
calls: { one: del('/v1/customers/{id}', { input: { id: text() }, changes: false }) }
```

## See also

`word.del`, `option.service.calls`
