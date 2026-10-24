# `browser` of `component`

Whether the component lives in the browser, or is drawn on the server alone.

## Value

`false` for a component that is drawn on the server alone: its HTML is sent, and none of its code, nor any package that only it imports, reaches the browser. Its style files do, as any component's: its own, those of a CSS Module and those of what only it imports, the style file that a package's own code imports among them, load on the pages that draw it. It is for a part that only draws: text made from Markdown by a large library, a chart, colored source code. It holds nothing that lives in the browser, and its file gives such components alone (`code.T6018`). Its `children`, and every property whose value is an element, are living children, which the page brings to life in their place. Left out, the component lives in the browser like any other.

## Example

```tsx
import { marked } from 'marked'
import { component, text } from 'tentjs/ui'

export const PriceTag = component('PriceTag', {
  browser: false,
  props: { text: text() },
  view: ({ text }) => <article dangerouslySetInnerHTML={{ __html: marked.parse(text) }} />,
})
```

## See also

`word.component`, `code.T6018`, `topic.look`
