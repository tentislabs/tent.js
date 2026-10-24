# `component`

A part of a screen that is written once and used as a tag, with typed properties, data or declared state of its own, a component it sits inside, or drawn on the server alone. Its name starts with a capital letter, and it is written in a `.tsx` file that imports `tentjs/ui`.

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

A screen imports the component from its file and writes it as a tag: `<PriceTag amount={o.total} />`. The properties of the tag are the `props` of the component, each checked against its type by the type checker: one that is optional or has a default may be left out. Elements are handed to the component as its `children`, as React does: what stands between the two tags of a use reaches the view as `children`, which it places where it wants:

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

A property that holds an element has no type word of its own yet: an element goes to a component as its `children`. A function, as a callback, goes to an ordinary React component (`option.component.props`). A use gives an `id` too, under which its state kept in the address and in the browser is kept. Any other React component, of the project's files or of a package, is an ordinary one and needs no word of ours.

The `view` is handed each of its `props`, each name of its `data`, and `state`, `user`, `language`, `settings`, `calls`, `set` and `children`. None of these names may be a name of `props`, of `data` or of `state`.

## Options

| Option | Means |
|---|---|
| `option.component.view` | The React component that draws the component. |
| `option.component.props` | The properties a use of the component gives it. |
| `option.component.data` | What the component reads when it is drawn. |
| `option.component.state` | The state that each use of the component keeps. |
| `option.component.layout` | The component that this one is shown in: its layout. |
| `option.component.browser` | Whether the component lives in the browser, or is drawn on the server alone. |
| `option.component.personal` | That the component answers each visitor their own. |
| `option.component.was` | The old name of the component, where it was renamed. |

## Returns

Something that is written as a tag, which carries the name, the kind `'component'` and the options.

## Errors

`code.T1003`: an option that `component` does not have.

`code.T1008`: `view` is left out.

`code.T1009`: a name of `props`, of `data` or of `state` is one of the names every view is handed.

`code.T1013`: the name does not start with a capital letter, or holds more than letters and digits.

`code.T1014`: a value that is not allowed: a state kept `in: 'device'`, which a component declares none of.

`code.T6012`: a component that holds itself, straight or through others.

`code.T6018`: a component drawn on the server alone that holds what lives in the browser.

`code.T6022`: a use of a component that keeps state in the address, with no `id` written in place.

## See also

`word.screen`, `word.read`, `topic.screens`
