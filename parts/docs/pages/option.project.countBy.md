# `countBy` of `project`

For whom the engine counts what the app does.

## Value

`'app'`, `'caller'` or `'limits'`. `'app'` when left out.

## Example

```ts
export const shop = project('shop', {
  countBy: 'caller',
})
```

## See also

`word.project`
