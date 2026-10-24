# `link`

A row of a table. One of the twelve types, which are used for the columns of a table, for inputs and outputs, for the checking of a form, for the API description, for MCP tools and for the answers of an AI.

## Example

```ts
customer: link('customers')
```

## Options

| Option | Means |
|---|---|
| `option.link.onRemove` | What happens to this row when the row that is linked to is removed. |

## Returns

`link(tableName, o?)` answers the record of the type. It takes the options every type takes, and as a column the options of a column.

A value fits when it is an id. The table is named as text, so two tables can link to each other.

In code a value of it is: `string`: the id of the row.

## Errors

`code.T0002`: a value of an input that does not fit the type.

## See also

`topic.types`
