# `view` of `screen`

The React component that draws the screen.

## Value

One arrow, which is required. It is handed one record: each name of `data` with its answer, and `params`, `state`, `user`, `language`, `settings`, `calls`, `set` and `above`. `set(values)` takes a record of declared states, of the screen and of the project, each with its new value, as `set({ tab: 'paid' })`, and changes them as a press does: a state kept in the address is written into the address, with a step of the browser's history where it states `back: true`. The view returns any React node: elements of HTML, components of the project's files and of any package, and the tags `Link`, `Form` and `Image`. Its look is the project's CSS (`topic.look`). A view is built into a module for the browser and one for the server.

## Example

```tsx
import { screen } from 'tentjs/ui'
import styles from './orders.module.css'

export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  access: 'signedIn',
  view: ({ user }) => (
    <main className={styles.page}>
      <h1>Open orders</h1>
      <p className={styles.muted}>Signed in as {user.id}</p>
    </main>
  ),
})
```

## Errors

`code.T1008`: it is left out.

`code.T1014`: what is written there is no arrow.

## See also

`word.screen`, `topic.look`, `topic.screens`
