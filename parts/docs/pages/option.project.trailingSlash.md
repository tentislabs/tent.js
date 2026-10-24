# `trailingSlash` of `project`

What becomes of a slash at the end of an address.

## Value

`'strip'` or `'keep'`. `'strip'` when left out.

## Example

```ts
export const shop = project('shop', {
  trailingSlash: 'keep',
})
```

## See also

`word.project`
