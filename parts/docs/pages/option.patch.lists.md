# `lists` of `patch`

How a list is written after the question mark. It is stated on a call with the method PATCH.

## Value

`'repeat'` where it is left out, `'brackets'` or `'comma'`.

## Example

```ts
calls: { one: patch('/v1/customers/{id}', { input: { id: text() }, lists: 'brackets' }) }
```

## See also

`word.patch`, `option.service.calls`
