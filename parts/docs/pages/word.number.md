# `number`

A number. One of the twelve types, which are used for the columns of a table, for inputs and outputs, for the checking of a form, for the API description, for MCP tools and for the answers of an AI.

## Example

```ts
total: number({ min: 0 })
```

## Options

| Option | Means |
|---|---|
| `option.number.max` | The largest number that is taken. |
| `option.number.min` | The smallest number that is taken. |
| `option.number.whole` | Holds the number to whole numbers. |

## Returns

`number(o?)` answers the record of the type. It takes the options every type takes, and as a column the options of a column.

A value fits when it is a finite number, within `min` and `max` where they are stated, and whole where `whole` is stated.

In code a value of it is: `number`.

## Errors

`code.T0002`: a value of an input that does not fit the type.

## See also

`topic.types`
