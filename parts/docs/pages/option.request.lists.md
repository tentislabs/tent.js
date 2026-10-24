# `lists` of `request`

How a list is written after the question mark. It is stated on a call of any method, which `request` names first.

## Value

`'repeat'` where it is left out, `'brackets'` or `'comma'`.

## Example

```ts
calls: { one: request('HEAD', '/v1/charges/{id}', { input: { id: text() }, lists: 'brackets' }) }
```

## See also

`word.request`, `option.service.calls`
