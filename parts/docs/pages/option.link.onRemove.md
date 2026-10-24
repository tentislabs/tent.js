# `onRemove` of `link`

What happens to this row when the row that is linked to is removed.

## Value

`'refuse'` refuses the removal, `'remove'` removes this row too, `'clear'` empties the column. `'refuse'` when left out.

## Example

```ts
customer: link('customers', { onRemove: 'clear', optional: true })
```

## See also

`word.link`, `topic.types`
