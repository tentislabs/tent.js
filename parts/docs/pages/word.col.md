# `col`

Names a column of the same row, in the `from` of a column.

## Example

```ts
fullName: text({ from: concat(col('first'), ' ', col('last')) })
```

## Returns

The record `{ col: 'first' }`, typed as the value it stands for.

## See also

`topic.words`
