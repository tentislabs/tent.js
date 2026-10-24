# `offer` of `screen`

The outside doors the screen is offered to.

## Value

A list. `['mcp']` offers the screen to programs that speak MCP, which show it to a person in a chat. Offered to none when left out.

## Example

```tsx
import { screen } from 'tentjs/ui'

export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  access: 'signedIn',
  offer: ['mcp'],
  view: () => <h1>Open orders</h1>,
})
```

## See also

`word.screen`
