# `data` of `component`

What the component reads when it is drawn.

## Value

A record of entries, each a `read(query or action, input, options)`, or an arrow over `{ props, state, user, settings }` that returns the record. An entry that fails does not change what the screen answers: its name is nothing, and `calls.<name>.error` holds the error.

## Example

```tsx
import { component, read, text } from 'tentjs/ui'
import { currencyRate } from '../functions/rates'

export const PriceTag = component('PriceTag', {
  props: { currency: text() },
  data: ({ props }) => ({ rate: read(currencyRate, { to: props.currency }) }),
  view: ({ rate }) => <p>{rate ?? 1}</p>,
})
```

## Errors

`code.T1009`: a name of `data` is one of the names every view is handed.

`code.T1014`: an entry that is no `read(...)`.

## See also

`word.component`, `word.read`
