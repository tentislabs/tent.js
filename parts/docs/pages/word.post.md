# `post`

A call of a service with the method POST.

## Example

```ts
calls: { createRefund: post('/v1/refunds', { input: { charge: text() } }) }
```

## Options

| Option | Means |
|---|---|
| `option.post.about` | One sentence on what the call is for. |
| `option.post.body` | How the fields that are left are sent as the body. |
| `option.post.changes` | The builder's word on whether the call changes anything at the service. |
| `option.post.files` | How a file of the answer is handed on. |
| `option.post.headers` | The fields that are sent as headers, each under its name. |
| `option.post.input` | The fields that the call is handed. |
| `option.post.lists` | How a list is written after the question mark. |
| `option.post.output` | The type of the answer of the call. |
| `option.post.query` | The fields that are written after the question mark of the address. |
| `option.post.sends` | The builder's word on whether the call sends data out. |

## Returns

The record of the call: its method, its path and what it states.

## See also

`word.service`, `word.request`
