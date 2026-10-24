# `server` of `screen`

Whether the screen is drawn on the server for the first HTML.

## Value

`false` for a screen that cannot be drawn on the server at all: the page is then sent with its answers and no drawing, and the browser draws it. Left out, the screen is drawn on the server, so its first HTML holds its rows and its words.

## Example

```tsx
import { screen } from 'tentjs/ui'

export const ordersScreen = screen('ordersScreen', {
  path: '/map',
  access: 'signedIn',
  server: false,
  view: () => <p>The map is drawn in the browser.</p>,
})
```

## See also

`word.screen`
