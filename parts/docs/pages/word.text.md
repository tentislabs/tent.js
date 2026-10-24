# `text`

Text. One of the twelve types, which are used for the columns of a table, for inputs and outputs, for the checking of a form, for the API description, for MCP tools and for the answers of an AI.

## Example

```ts
name: text({ min: 1, max: 200 })
```

## Options

| Option | Means |
|---|---|
| `option.text.lines` | Whether a form shows the text as one line or as a box of many lines. |
| `option.text.max` | The most characters the text may have. |
| `option.text.min` | The fewest characters the text may have. |
| `option.text.pattern` | A regular expression that the text must fit. |
| `option.text.secret` | Marks a text that a form does not show while it is typed, as a password. |

## Returns

`text(o?)` answers the record of the type. It takes the options every type takes, and as a column the options of a column.

A value fits when it is text, within `min` and `max` where they are stated, and fits `pattern` where one is stated.

In code a value of it is: `string`.

## Errors

`code.T0002`: a value of an input that does not fit the type.

## See also

`topic.types`
