# `about` of `screen`

One sentence on what the screen is for.

## Value

Text. It is for a person and for a coding agent that reads the project. It is not shown on the page.

## Example

```tsx
import { screen } from 'tentjs/ui'

export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  about: 'Where staff see the orders that are not paid yet.',
  access: 'signedIn',
  view: () => <h1>Open orders</h1>,
})
```

## See also

`word.screen`
