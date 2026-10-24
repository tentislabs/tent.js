# `changes` of `get`

The builder's word on whether the call changes anything at the service. It is stated on a call with the method GET.

## Value

True or false. Left out, a `get` changes nothing and every other method changes something.

## Example

```ts
calls: { one: get('/v1/charges/{id}', { input: { id: text() }, changes: false }) }
```

## See also

`word.get`, `option.service.calls`
