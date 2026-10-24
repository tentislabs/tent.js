# `put`

A call of a service with the method PUT.

## Example

```ts
calls: { setName: put('/v1/name', { input: { name: text() } }) }
```

## Options

| Option | Means |
|---|---|
| `option.put.about` | One sentence on what the call is for. |
| `option.put.body` | How the fields that are left are sent as the body. |
| `option.put.changes` | The builder's word on whether the call changes anything at the service. |
| `option.put.files` | How a file of the answer is handed on. |
| `option.put.headers` | The fields that are sent as headers, each under its name. |
| `option.put.input` | The fields that the call is handed. |
| `option.put.lists` | How a list is written after the question mark. |
| `option.put.output` | The type of the answer of the call. |
| `option.put.query` | The fields that are written after the question mark of the address. |
| `option.put.sends` | The builder's word on whether the call sends data out. |

## Returns

The record of the call: its method, its path and what it states.

## See also

`word.service`, `word.request`
