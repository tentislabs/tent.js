# `files` of `request`

How a file of the answer is handed on. It is stated on a call of any method, which `request` names first.

## Value

`'base64'`: a file that the service answers in base64 is kept as a file of the app. Left out, it is handed on as it came.

## Example

```ts
calls: { one: request('HEAD', '/v1/charges/{id}', { input: { id: text() }, files: 'base64' }) }
```

## See also

`word.request`, `option.service.calls`
