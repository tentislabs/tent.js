# `hosts` of `project`

The hosts that a page may load pictures, sound and video from, and connect to.

## Value

A list of hosts. Left out, a page reaches the app alone.

## Example

```ts
export const shop = project('shop', {
  hosts: ['images.example.com'],
})
```

## See also

`word.project`
