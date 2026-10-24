# `cache` of `screen`

How long the drawn screen is kept for the next visitor.

## Value

A length of time, as `'5 minutes'`, or `{ for: '5 minutes', public: true }`. No cache when left out. It is for a public screen that is the same for everyone.

A component that answers each visitor their own - a header that reads `user`, a count of the visitor's rows - is a personal part: the screen is kept as it is drawn for nobody, with the screen's `loading` component in the place of each personal part, and every visitor, signed in or not, is sent that kept part at once and their own parts drawn for them in the same answer (`option.component.personal`).

## Example

```tsx
import { screen } from 'tentjs/ui'

export const ordersScreen = screen('ordersScreen', {
  path: '/prices',
  access: 'anyone',
  cache: '5 minutes',
  view: () => <h1>Prices</h1>,
})
```

## Errors

`code.T1011`: the words are no length of time.

## See also

`word.screen`, `option.component.personal`
