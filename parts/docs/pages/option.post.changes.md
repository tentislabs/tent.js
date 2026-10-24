# `changes` of `post`

The builder's word on whether the call changes anything at the service. It is stated on a call with the method POST.

## Value

True or false. Left out, a `get` changes nothing and every other method changes something.

## Example

```ts
calls: { one: post('/v1/refunds', { input: { id: text() }, changes: false }) }
```

## See also

`word.post`, `option.service.calls`
