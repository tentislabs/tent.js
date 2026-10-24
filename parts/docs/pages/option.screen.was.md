# `was` of `screen`

The old name of the screen, where it was renamed.

## Value

One name, or a list of names.

## Example

```tsx
import { screen } from 'tentjs/ui'

export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  access: 'signedIn',
  was: 'deskScreen',
  view: () => <h1>Open orders</h1>,
})
```

## See also

`word.screen`
