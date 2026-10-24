# `was` of `component`

The old name of the component, where it was renamed.

## Value

One name, or a list of names.

## Example

```tsx
import { component } from 'tentjs/ui'

export const PriceTag = component('PriceTag', {
  was: 'Price',
  view: () => <p>Total</p>,
})
```

## See also

`word.component`
