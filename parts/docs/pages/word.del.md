# `del`

A call of a service with the method DELETE.

## Example

```ts
calls: { removeItem: del('/v1/items/{id}', { input: { id: text() } }) }
```

## Options

| Option | Means |
|---|---|
| `option.del.about` | One sentence on what the call is for. |
| `option.del.body` | How the fields that are left are sent as the body. |
| `option.del.changes` | The builder's word on whether the call changes anything at the service. |
| `option.del.files` | How a file of the answer is handed on. |
| `option.del.headers` | The fields that are sent as headers, each under its name. |
| `option.del.input` | The fields that the call is handed. |
| `option.del.lists` | How a list is written after the question mark. |
| `option.del.output` | The type of the answer of the call. |
| `option.del.query` | The fields that are written after the question mark of the address. |
| `option.del.sends` | The builder's word on whether the call sends data out. |

## Returns

The record of the call: its method, its path and what it states.

## See also

`word.service`, `word.request`
