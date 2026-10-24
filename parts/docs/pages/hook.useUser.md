# `useUser`

Answers who looks at the page, in the code of a view. A view is handed the same as `user`.

## Example

```tsx
import { component, useUser } from 'tentjs/ui'

export const Greeting = component('Greeting', {
  view: () => {
    const user = useUser()
    return <span>{user ? `Signed in as ${user.id}` : 'Not signed in'}</span>
  },
})
```

## Returns

`{ id, roles }`, or nothing for a caller who is not signed in.

## See also

`word.screen`, `hook.useParams`
