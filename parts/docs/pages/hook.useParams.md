# `useParams`

Answers the values of the address of the screen that is shown, in the code of a view. A screen's view is handed the same as `params`.

## Example

```tsx
import { component, useParams } from 'tentjs/ui'

export const OrderNumber = component('OrderNumber', {
  view: () => {
    const params = useParams()
    return <span>Order {params.id}</span>
  },
})
```

## Returns

A record of the values of the address, each as text: for a screen at `/orders/:id` that was asked for as `/orders/42`, `{ id: '42' }`. The rest of a pattern that ends in `*` is `rest`.

## See also

`option.screen.path`, `hook.useUser`
