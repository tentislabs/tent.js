# `given`

Leaves an entry of a filter out while its value is nothing, empty text or an empty list.

## Example

```ts
rows: orders.where({ status: given(input('status')) })
```

## Returns

The record that marks the entry, typed as the value it was handed. The entry is stored with `"given": true`.

## See also

`topic.words`
