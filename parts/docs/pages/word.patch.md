# `patch`

A call of a service with the method PATCH.

## Example

```ts
calls: { rename: patch('/v1/items/{id}', { input: { id: text(), name: text() } }) }
```

## Options

| Option | Means |
|---|---|
| `option.patch.about` | One sentence on what the call is for. |
| `option.patch.body` | How the fields that are left are sent as the body. |
| `option.patch.changes` | The builder's word on whether the call changes anything at the service. |
| `option.patch.files` | How a file of the answer is handed on. |
| `option.patch.headers` | The fields that are sent as headers, each under its name. |
| `option.patch.input` | The fields that the call is handed. |
| `option.patch.lists` | How a list is written after the question mark. |
| `option.patch.output` | The type of the answer of the call. |
| `option.patch.query` | The fields that are written after the question mark of the address. |
| `option.patch.sends` | The builder's word on whether the call sends data out. |

## Returns

The record of the call: its method, its path and what it states.

## See also

`word.service`, `word.request`
