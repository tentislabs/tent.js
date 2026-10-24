# `access` of `screen`

Who may be shown the screen.

## Value

A rule, which is required: `'signedIn'`, `role('staff')`, `'anyone'` or `anyone('why')`, or `'nobody'`. A caller who is not signed in is sent to the sign-in screen, and comes back afterwards. A signed-in caller whom the rule does not let in is answered the `notFound` screen, so they learn nothing about the screen. On a screen that lets no visitor in, `user` in the view is always there.

The rule of a screen decides who sees the page, and nothing else. What must stay closed is closed by the rule of a query, a change or a table.

## Example

```tsx
import { screen, role } from 'tentjs/ui'

export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  access: role('staff'),
  view: () => <h1>Open orders</h1>,
})
```

## Errors

`code.T1008`: it is left out.

`code.T1014`: what is written there is no rule.

## See also

`word.screen`
