# `icon` of `project`

The picture a browser shows for the site.

## Value

An asset, written `asset('icon.svg')`. Left out, the site has no icon. The project of `tent new` names `assets/icon.svg`, the mark of Tent.js: a file of your own in its place, or another asset here, gives the site its own icon.

## Example

```ts
export const shop = project('shop', {
  icon: asset('icon.svg'),
})
```

## See also

`word.project`
