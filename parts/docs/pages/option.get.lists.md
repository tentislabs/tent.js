# `lists` of `get`

How a list is written after the question mark. It is stated on a call with the method GET.

## Value

`'repeat'` where it is left out, `'brackets'` or `'comma'`.

## Example

```ts
calls: { one: get('/v1/charges/{id}', { input: { id: text() }, lists: 'brackets' }) }
```

## See also

`word.get`, `option.service.calls`
