# `state` of `component`

The state that each use of the component keeps.

## Value

A record of entries, each a type, or `{ type, in, back, reset }`, as on a screen. Each use of a component has its own state. It may be kept in the page, `in: 'address'` or `in: 'browser'`. A component declares no state `in: 'device'`: its screen does. What a use keeps in the address is written under the `id` of the use, a tilde and the name of the state, as `?list~page=2`, so a use of a component that keeps state in the address writes its `id` in place (`code.T6022`).

## Example

```tsx
import { component, boolean } from 'tentjs/ui'

export const PriceTag = component('PriceTag', {
  state: { open: boolean() },
  view: ({ state }) => <p>{state.open ? 'Open' : 'Closed'}</p>,
})
```

## Errors

`code.T1009`: a name of `state` is one of the names every view is handed.

`code.T1014`: a state that is no `boolean`, states no `default` and is not `optional`, a state kept `in: 'device'`, a type that its place cannot hold, or `back` on a state that is not kept in the address.

## See also

`word.component`, `option.screen.state`
