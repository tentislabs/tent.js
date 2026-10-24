# `date`

A moment in time. One of the twelve types, which are used for the columns of a table, for inputs and outputs, for the checking of a form, for the API description, for MCP tools and for the answers of an AI.

## Example

```ts
placedAt: date({ default: 'now' })
```

## Returns

`date(o?)` answers the record of the type. It takes the options every type takes, and as a column the options of a column.

A value fits when it is a `Date`, or text in the standard form with its zone. As an input both are taken, and the function is handed a `Date`. `default: 'now'` is the moment the value is made.

In code a value of it is: `Date` in backend code. On the wire, in a saved step result and in a screen it is text in the standard form, `2026-10-08T12:00:00.000Z`.

## Errors

`code.T0002`: a value of an input that does not fit the type.

## See also

`topic.types`
