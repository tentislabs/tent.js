# `files` of `post`

How a file of the answer is handed on. It is stated on a call with the method POST.

## Value

`'base64'`: a file that the service answers in base64 is kept as a file of the app. Left out, it is handed on as it came.

## Example

```ts
calls: { one: post('/v1/refunds', { input: { id: text() }, files: 'base64' }) }
```

## See also

`word.post`, `option.service.calls`
