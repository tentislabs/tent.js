# `roots` of `project`

Folders outside the project that its files may be named from.

## Value

A list of folders, as `['../shared']`. Left out, every file of the project lies inside its folder.

## Example

```ts
export const shop = project('shop', {
  roots: ['../shared'],
})
```

## See also

`word.project`
