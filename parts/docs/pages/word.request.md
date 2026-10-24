# `request`

A call of a service with any method, for one that has no word of its own.

## Example

```ts
calls: { headOf: request('HEAD', '/v1/items/{id}', { input: { id: text() } }) }
```

## Options

| Option | Means |
|---|---|
| `option.request.about` | One sentence on what the call is for. |
| `option.request.body` | How the fields that are left are sent as the body. |
| `option.request.changes` | The builder's word on whether the call changes anything at the service. |
| `option.request.files` | How a file of the answer is handed on. |
| `option.request.headers` | The fields that are sent as headers, each under its name. |
| `option.request.input` | The fields that the call is handed. |
| `option.request.lists` | How a list is written after the question mark. |
| `option.request.output` | The type of the answer of the call. |
| `option.request.query` | The fields that are written after the question mark of the address. |
| `option.request.sends` | The builder's word on whether the call sends data out. |

## Returns

The record of the call: its method, its path and what it states.

## See also

`word.service`, `word.get`
