# `get`

A call of a service with the method GET.

## Example

```ts
calls: { getCharge: get('/v1/charges/{id}', { input: { id: text() } }) }
```

## Options

| Option | Means |
|---|---|
| `option.get.about` | One sentence on what the call is for. |
| `option.get.body` | How the fields that are left are sent as the body. |
| `option.get.changes` | The builder's word on whether the call changes anything at the service. |
| `option.get.files` | How a file of the answer is handed on. |
| `option.get.headers` | The fields that are sent as headers, each under its name. |
| `option.get.input` | The fields that the call is handed. |
| `option.get.lists` | How a list is written after the question mark. |
| `option.get.output` | The type of the answer of the call. |
| `option.get.query` | The fields that are written after the question mark of the address. |
| `option.get.sends` | The builder's word on whether the call sends data out. |

## Returns

The record of the call: its method, its path and what it states.

## See also

`word.service`, `word.request`
