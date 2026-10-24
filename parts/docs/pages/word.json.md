# `json`

Any JSON value. One of the twelve types, which are used for the columns of a table, for inputs and outputs, for the checking of a form, for the API description, for MCP tools and for the answers of an AI.

## Example

```ts
payload: json({ optional: true })
```

## Returns

`json(o?)` answers the record of the type. It takes the options every type takes, and as a column the options of a column.

Every value fits. Nothing inside it is checked, and a `null` inside it is kept as it is. An input of two shapes, or with free keys, is a `json()` that the function checks itself.

In code a value of it is: `unknown`.

## Errors

`code.T0002`: a value of an input that does not fit the type.

## See also

`topic.types`
