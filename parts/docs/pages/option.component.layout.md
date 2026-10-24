# `layout` of `component`

The component that this one is shown in: its layout.

## Value

A component, or its name as text. It is drawn around this one.

## Example

```tsx
import { component } from 'tentjs/ui'

export const PriceTag = component('PriceTag', {
  layout: 'Card',
  view: () => <p>Total</p>,
})
```

## Errors

`code.T1014`: what is written there is neither a component nor a name.

## See also

`word.component`
