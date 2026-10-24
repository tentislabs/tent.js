# `framedBy` of `screen`

Which other sites may show the screen in a frame.

## Value

A list of origins, as `['https://studio.example.com']`, or `'anyone'`. Left out, no other site may frame the screen.

## Example

```tsx
import { screen } from 'tentjs/ui'

export const ordersScreen = screen('ordersScreen', {
  path: '/badge',
  access: 'anyone',
  framedBy: ['https://studio.example.com'],
  view: () => <p>Made with our shop</p>,
})
```

## See also

`word.screen`
