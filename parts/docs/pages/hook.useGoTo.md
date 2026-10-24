# `useGoTo`

Moves to another screen from the code of a view.

## Example

```tsx
import { screen, useCall, useGoTo } from 'tentjs/ui'
import { addOrder } from '../functions/orders'
import { orderScreen } from './order'

export const quickScreen = screen('quickScreen', {
  path: '/quick',
  access: 'signedIn',
  view: () => {
    const add = useCall(addOrder)
    const goTo = useGoTo()
    const press = async () => {
      const order = await add.call({ total: 0 })
      goTo(orderScreen, { id: order.id })
    }
    return (
      <button type="button" onClick={press}>
        New order
      </button>
    )
  },
})
```

## Takes

Nothing.

## Returns

`goTo(target, values, { replace })`. `target` is a screen as the screen file imported it, a path of the app as `'/orders'`, or `'#<id>'`. `values` are the values of the screen's address and of the state it keeps in the address. It moves inside the page, as the press of a `Link` does: the screen is asked for and drawn, the address and the browser's history change, and the focus goes to the first `<h1>` of the new screen with the page at its top (`tag.Link`). With `{ replace: true }` it takes the place of the page in the history of the browser, so that the back button leads past the page that was left: `goTo(orderScreen, { id: order.id }, { replace: true })`. A target that is no address of the app - a text that does not start with one `/`, or that holds `//` or `\` - goes nowhere, and one written in place is `code.T6013`.

## See also

`tag.Link`, `hook.useCall`
