# `history` of `project`

What the history of the project leaves out.

## Value

`{ leave }`: patterns of files that no point holds. `['node_modules/']` when left out.

## Example

```ts
export const shop = project('shop', {
  history: { leave: ['*.log'] },
})
```

## See also

`word.project`
