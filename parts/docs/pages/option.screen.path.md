# `path` of `screen`

The address of the screen.

## Value

Text that starts with `/`. A part that starts with a colon is a value, which the view reads as text under `params`: `/orders/:id` gives `params.id`. A last part `*` takes the rest of the address, as `params.rest`, and an empty rest too: `/docs/*` answers `/docs` where no screen stands at `/docs`, and a screen at `/docs` answers it where one does. A screen states `path` or `for`, never both and never neither. An address under `/_t/`, and one whose first part is the code of a language of the project, could never be reached and is refused.

## Example

```tsx
import { screen } from 'tentjs/ui'

export const ordersScreen = screen('ordersScreen', {
  path: '/orders/:id',
  access: 'signedIn',
  view: ({ params }) => <p>Order {params.id}</p>,
})
```

## Errors

`code.T1007`: `for` is stated too.

`code.T1008`: neither `path` nor `for` is stated.

`code.T1014`: the address does not start with `/`, starts with `/_t/`, or starts with the code of a language.

## See also

`word.screen`, `option.screen.for`
