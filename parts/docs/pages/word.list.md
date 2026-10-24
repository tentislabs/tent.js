# `list`

A list of values of one type. One of the twelve types, which are used for the columns of a table, for inputs and outputs, for the checking of a form, for the API description, for MCP tools and for the answers of an AI.

## Example

```ts
tags: list(text(), { max: 10 })
```

## Options

| Option | Means |
|---|---|
| `option.list.max` | The most entries the list may have. |
| `option.list.min` | The fewest entries the list may have. |

## Returns

`list(type, o?)` answers the record of the type. It takes the options every type takes, and as a column the options of a column.

A value fits when it is a list, each entry fits the inner type, and it has no fewer entries than `min` and no more than `max` where they are stated. An entry that fails is named by its number, as `lines.0.qty`.

In code a value of it is: A list of the inner type.

## Errors

`code.T0002`: a value of an input that does not fit the type.

## See also

`topic.types`
