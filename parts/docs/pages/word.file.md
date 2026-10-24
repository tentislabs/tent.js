# `file`

A file that was uploaded or stored. One of the twelve types, which are used for the columns of a table, for inputs and outputs, for the checking of a form, for the API description, for MCP tools and for the answers of an AI.

## Example

```ts
receipt: file({ optional: true, kinds: ['application/pdf'], maxSize: '10 MB' })
```

## Options

| Option | Means |
|---|---|
| `option.file.kinds` | The kinds of file that are taken. |
| `option.file.maxSize` | The largest file that is taken. |

## Returns

`file(o?)` answers the record of the type. It takes the options every type takes, and as a column the options of a column.

A value fits when it is an id.

In code a value of it is: `string`: the id of the file.

## Errors

`code.T0002`: a value of an input that does not fit the type.

## See also

`topic.types`
