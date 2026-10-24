# `layout` of `screen`

The component that the screen is shown in: its layout.

## Value

A component, or its name as text. The component is drawn around the screen and is handed it as `children`, which it places where it wants: the navigation that many screens share, as a layout of Next.js does. It stays as it is while a visitor moves between screens that share it.

## Example

```tsx
import { screen } from 'tentjs/ui'
import { AppShell } from '../components/AppShell'

export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  access: 'signedIn',
  layout: AppShell,
  view: () => <h1>Open orders</h1>,
})
```

## Errors

`code.T1014`: what is written there is neither a component nor a name.

## See also

`word.screen`, `word.component`
