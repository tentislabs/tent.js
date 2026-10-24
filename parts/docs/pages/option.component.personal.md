# `personal` of `component`

Says that a component answers each visitor their own, so that a screen which is kept by its `cache` draws it afresh for every visitor.

## Value

`true`, or left out. A component is personal by itself where the description shows it: an entry of its `data` that not everyone may read, or a `data` that reads `user` or a state kept in the device. A view may read either in ways the build cannot see, and states `personal: true` to be held the same.

A screen with `cache` keeps what it draws for nobody with the screen's `loading` component, or nothing, in the place of each personal component, and sends that kept part at once to every visitor, whoever they are. Each personal component is drawn for the visitor alone, from the properties its use gave it, and streamed into the same answer (`topic.screens.streaming`). It is never kept. With `cache: { public: true }` a visitor who is nobody is sent the kept part alone, which a cache outside may keep, and the page asks each personal component's data once it has come alive.

## Example

```tsx
import { component, useUser } from 'tentjs/ui'

export const Greeting = component('Greeting', {
  personal: true,
  view: () => {
    const user = useUser()
    return <p>{user ? `Welcome back, ${user.id}` : 'Welcome'}</p>
  },
})
```

## See also

`word.component`, `option.screen.cache`, `topic.screens`
