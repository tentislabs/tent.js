# `lists` of `put`

How a list is written after the question mark. It is stated on a call with the method PUT.

## Value

`'repeat'` where it is left out, `'brackets'` or `'comma'`.

## Example

```ts
calls: { one: put('/v1/customers/{id}', { input: { id: text() }, lists: 'brackets' }) }
```

## See also

`word.put`, `option.service.calls`
