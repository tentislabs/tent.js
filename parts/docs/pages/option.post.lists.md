# `lists` of `post`

How a list is written after the question mark. It is stated on a call with the method POST.

## Value

`'repeat'` where it is left out, `'brackets'` or `'comma'`.

## Example

```ts
calls: { one: post('/v1/refunds', { input: { id: text() }, lists: 'brackets' }) }
```

## See also

`word.post`, `option.service.calls`
