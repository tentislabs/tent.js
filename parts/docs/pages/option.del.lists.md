# `lists` of `del`

How a list is written after the question mark. It is stated on a call with the method DELETE.

## Value

`'repeat'` where it is left out, `'brackets'` or `'comma'`.

## Example

```ts
calls: { one: del('/v1/customers/{id}', { input: { id: text() }, lists: 'brackets' }) }
```

## See also

`word.del`, `option.service.calls`
