# `loading` of `screen`

The component that is shown while a move to another screen takes time, and in the place of each part of a streamed page that waits for its data.

## Value

A component, or its name as text. With none named, the screen that is shown stays until the next one is ready, and a part that waits holds nothing until it comes. `topic.screens.streaming` says when a page is streamed.

It is the screen's that is left: once a move away from it has taken `loadingAfter` of `option.project.limits`, 200 ms where the project states none, the component stands where the screen stood, inside its `layout`, so the navigation around it stays as it is. It is handed nothing but what every view is handed.

## Example

```tsx
import { screen } from 'tentjs/ui'
import { Spinner } from '../components/Spinner'

export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  access: 'signedIn',
  loading: Spinner,
  view: () => <h1>Open orders</h1>,
})
```

## Errors

`code.T1014`: what is written there is neither a component nor a name.

## See also

`word.screen`, `word.component`, `topic.screens`
