# `day`

A calendar day, with no time and no zone. One of the twelve types, which are used for the columns of a table, for inputs and outputs, for the checking of a form, for the API description, for MCP tools and for the answers of an AI.

## Example

```ts
due: day({ optional: true })
```

## Returns

`day(o?)` answers the record of the type. It takes the options every type takes, and as a column the options of a column.

A value fits when it is text in that form and names a day of the calendar. `default: 'today'` is the day the value is made.

In code a value of it is: `string`, in the form `'2026-10-08'`.

## Errors

`code.T0002`: a value of an input that does not fit the type.

## See also

`topic.types`
