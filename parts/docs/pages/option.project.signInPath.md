# `signInPath` of `project`

Where a visitor is sent when a screen needs a signed-in user.

## Value

A path of the app. `'/sign-in'` when left out.

## Example

```ts
export const shop = project('shop', {
  signInPath: '/sign-in',
})
```

## See also

`word.project`
