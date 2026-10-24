# `vector`

A list of numbers that stands for a meaning, for search by meaning. One of the twelve types, which are used for the columns of a table, for inputs and outputs, for the checking of a form, for the API description, for MCP tools and for the answers of an AI.

## Example

```ts
meaning: vector({ size: 1536, model: embedder })
```

## Options

| Option | Means |
|---|---|
| `option.vector.copy` | How the copy of the column in memory holds its numbers. |
| `option.vector.model` | The model that makes the vectors. |
| `option.vector.old` | What becomes of the vectors a column holds when its model changes. |
| `option.vector.size` | How many numbers a vector holds. |

## Returns

`vector(o)` answers the record of the type. It takes the options every type takes, and as a column the options of a column.

A value fits when it is a list of exactly `size` finite numbers. A vector takes `label`, `help` and `optional`, and as a column `private`, `personal` and `was`. It takes no `default`, and as a column it is never `unique` or indexed and is always optional.

In code a value of it is: `number[]`.

## Errors

`code.T0002`: a value of an input that does not fit the type.

## See also

`topic.types`
