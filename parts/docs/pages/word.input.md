# `input`

Stands for a value of the input, in a form written with values.

## Example

```ts
rows: orders.limit(input('limit'))
```

## Returns

The record `{ input: 'limit' }`, typed as the value it stands for. It is worked out when the definition is carried out.

## See also

`topic.words`, `word.caller`
