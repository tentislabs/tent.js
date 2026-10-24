# `state` of `screen`

The state that the screen keeps: in the page, in the address, or in the browser.

## Value

A record of entries, each a type, or `{ type, in, back, reset }`. A state starts as the `default` of its type, and a `boolean` with none starts false. Any other type with no `default` is written `optional: true`, and starts as nothing. The view reads it under `state`.

| `in` | The state is kept |
|---|---|
| left out | In the page, while the screen is shown. |
| `'address'` | After the question mark of the address, as text: `/orders?tab=paid`. A `json`, a `file` and a `vector` are no text of an address: such a state is kept in the page. |
| `'device'` | In a cookie of this browser, between visits, so the first HTML already knows it. The cookie, `tent_state.<the app's name>`, and over https `__Host-tent_state.<the app's name>`, is kept for a year from its last change, and the scripts of the page may read it, as a script of the head does that sets the look before the first paint (`topic.look.dark`). It takes a `boolean`, a `choice`, a `number`, or a `text` with a `max` of 100 or less, and the cookie that holds all such states of an app may be 3,500 bytes with each at the largest it could hold: a `text` counts as four bytes for each character of its `max`. |
| `'browser'` | In the browser's own store for this site, for any plain type. The first HTML is drawn with the default. |

`back: true` on a state that is kept in the address adds a step to the browser's history for each change that a press makes. `reset` names other states of the screen: when one of them changes, this one goes back to its default.

A view changes a state with `set`, `set({ tab: 'paid' })`, or a `Link` with `set`. A search box kept in the address, with pages of its rows, is shown whole in `topic.screens.lists`.

## Example

```tsx
import { screen, choice, number } from 'tentjs/ui'

export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  access: 'signedIn',
  state: {
    tab: { type: choice(['open', 'paid'], { default: 'open' }), in: 'address', back: true },
    page: { type: number({ default: 1 }), in: 'address', reset: ['tab'] },
  },
  view: ({ state }) => (
    <p>
      The {state.tab} orders, page {state.page}
    </p>
  ),
})
```

## Errors

`code.T1009`: a name of `state` is one of the names every view is handed.

`code.T1014`: a state that is no `boolean`, states no `default` and is not `optional`, an `in` that is none of the three, a type that its place cannot hold, or `back` on a state that is not kept in the address.

## See also

`word.screen`, `topic.screens`, `tag.Link`
