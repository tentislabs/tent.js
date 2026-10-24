# `boolean`

True or false. One of the twelve types, which are used for the columns of a table, for inputs and outputs, for the checking of a form, for the API description, for MCP tools and for the answers of an AI.

## Example

```ts
done: boolean({ default: false })
```

## Returns

`boolean(o?)` answers the record of the type. It takes the options every type takes, and as a column the options of a column.

A value fits when it is `true` or `false`.

In code a value of it is: `boolean`.

## Errors

`code.T0002`: a value of an input that does not fit the type.

## See also

`topic.types`
