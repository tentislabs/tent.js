# `choice`

One of a list of values, each a text. One of the twelve types, which are used for the columns of a table, for inputs and outputs, for the checking of a form, for the API description, for MCP tools and for the answers of an AI.

## Example

```ts
status: choice(['open', 'paid', 'shipped'], { default: 'open' })
```

## Options

| Option | Means |
|---|---|
| `option.choice.messages` | The key of the language files under which each value of the choice has its message, so that a form shows the values in the language of its page. |

## Returns

`choice(values, o?)` answers the record of the type. It takes the options every type takes, and as a column the options of a column.

A value fits when it is one of the values. Any other text is refused, and the field fails the check `values`.

In code a value of it is: The union of its values.

## Errors

`code.T0002`: a value of an input that does not fit the type.

## See also

`topic.types`
