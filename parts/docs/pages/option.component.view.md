# `view` of `component`

The React component that draws the component.

## Value

One arrow, which is required. It is handed one record: each of the `props`, each name of `data`, and `state`, `user`, `language`, `settings`, `calls`, `set` and `children`. It returns any React node. A use places what it holds between its tags where the view puts `children`.

## Example

```tsx
import { component, text } from 'tentjs/ui'

export const Card = component('Card', {
  props: { title: text() },
  view: ({ title, children }) => (
    <section className="card">
      <h2>{title}</h2>
      {children}
    </section>
  ),
})
```

## Errors

`code.T1008`: it is left out.

`code.T1014`: what is written there is no arrow.

## See also

`word.component`
