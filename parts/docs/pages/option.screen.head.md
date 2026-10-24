# `head` of `screen`

More lines of the head of the page.

## Value

A list of lines, each one of three: `{ meta: { name, property, content, media } }`, `{ link: { rel, href, type, sizes, media, hreflang, title, as, crossorigin } }` and `{ script: { src, async, defer, type, load, consent } }`. `href` and `src` take an address or an asset. A `script` comes from an asset, or from a host that `unlock.scripts` of the project lists. `load` and `consent` say when a script is added, as `option.project.head` gives them: the script of a screen that loads later is added when a move first reaches that screen.

## Example

```tsx
import { screen } from 'tentjs/ui'

export const ordersScreen = screen('ordersScreen', {
  path: '/prices',
  access: 'anyone',
  head: [{ meta: { name: 'theme-color', content: '#0f1115' } }],
  view: () => <h1>Prices</h1>,
})
```

## Errors

`code.T1014`: a line that is none of the three, a name its kind does not take, or a script from a host that was not opened.

## See also

`word.screen`
