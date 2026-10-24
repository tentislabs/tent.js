# `object`

A record with named fields, each of a type. One of the twelve types, which are used for the columns of a table, for inputs and outputs, for the checking of a form, for the API description, for MCP tools and for the answers of an AI.

## Example

```ts
address: object({ street: text(), city: text(), zip: text({ optional: true }) })
```

## Returns

`object(shape, o?)` answers the record of the type. It takes the options every type takes, and as a column the options of a column.

A value fits when it is a record, each of its fields fits its type, and it holds no field that the shape does not name: such a field fails the check `unknown`.

In code a value of it is: An object of the inner types. A field that is optional and has no default may be missing.

## Errors

`code.T0002`: a value of an input that does not fit the type.

## See also

`topic.types`
