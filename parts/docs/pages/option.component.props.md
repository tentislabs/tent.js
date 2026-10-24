# `props` of `component`

The properties a use of the component gives it.

## Value

A record of types, each by its name. A use writes them as the properties of the tag, `<PriceTag amount={o.total} />`, and the view reads them by their names. One that is optional or has a default may be left out. Elements are handed to the component as its `children`, between the two tags of a use, as React does: a property that holds an element has no type word of its own yet. Nor has one that holds a function, as a callback: a part that is handed one is an ordinary React component, a function of the project's files that takes its properties as React does, drawn inside the view of a component or a screen, where the function is made. A name may not be one of the names every view is handed, as `state` or `children`.

## Example

```tsx
import { component, number, text, useTranslations } from 'tentjs/ui'

export const PriceTag = component('PriceTag', {
  props: { amount: number(), currency: text({ default: 'USD' }) },
  view: ({ amount, currency }) => {
    const { format } = useTranslations()
    return <span className="price">{format(amount, { currency })}</span>
  },
})
```

A part that is handed a function, inside a component that holds the state:

```tsx
import { useState } from 'react'
import { component } from 'tentjs/ui'

function Toggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button type="button" aria-expanded={open} onClick={onToggle}>
      Details
    </button>
  )
}

export const Talk = component('Talk', {
  view: () => {
    const [open, setOpen] = useState(false)
    return (
      <section>
        <Toggle open={open} onToggle={() => setOpen(!open)} />
        {open && <p>The details of the talk.</p>}
      </section>
    )
  },
})
```

## Errors

`code.T1009`: a name of `props` is one of the names every view is handed.

`code.T1014`: an entry that is no type.

## See also

`word.component`
