# `files` of `get`

How a file of the answer is handed on. It is stated on a call with the method GET.

## Value

`'base64'`: a file that the service answers in base64 is kept as a file of the app. Left out, it is handed on as it came.

## Example

```ts
calls: { one: get('/v1/charges/{id}', { input: { id: text() }, files: 'base64' }) }
```

## See also

`word.get`, `option.service.calls`
