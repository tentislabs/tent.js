# `redirects` of `project`

Addresses that send a visitor on to another.

## Value

A list of `{ from, to, permanent }`. `permanent` is true unless it says false. Left out, nothing is sent on.

## Example

```ts
export const shop = project('shop', {
  redirects: [{ from: '/old/:id', to: '/orders/:id', permanent: false }],
})
```

## See also

`word.project`
