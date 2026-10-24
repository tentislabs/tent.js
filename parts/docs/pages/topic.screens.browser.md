# The browser build and libraries

This page says what the build makes for a browser, and how components of any library come in.

## What the build makes for a browser

For a project that holds a screen the bundle holds, under `browser/`, each named with its fingerprint: the page code, which is what runs a page, React and the tags among it, and is the same files in every project; one module for each screen and for each component, with the style files they import; and the style files that several screens import, once. A module for each view lies under `server/` too, for the first HTML, beside the one file of the page code that draws on a server. A view and the packages it imports find React and `tentjs/ui` in the page code, so a page holds React once. The `error` screen of the page code is part of the page code, and a project's own `error` screen is loaded only when a view fails in the browser. The description names them in `browser` and in `server.views`. Changing one screen changes the modules of that screen and no other.

In development, as Vite serves a page, each file of the project that a view reaches is a module of its own, at an address that holds its place and no fingerprint, `browser/src.<path>.js`, so every module that imports it names it the same way through every save, and a save writes again the files whose texts changed and none that imports them. A page asks each such module at its mark, `?v=` and twelve characters that change with the file and with every file it imports, and the engine serves it with `Cache-Control: no-store`; the page code keeps its fingerprint. The development form of the page code holds React's runtime of Fast Refresh, which a release and a page of the mode `test` never load.

## Components of any library

A screen file may import any package, and draw with any library of components: a view is built and run as React code. An ordinary React component, in a screen file or in `components/`, is drawn as it is written; `component()` is needed only for typed properties, its own `data` or state, `layout`, or `browser: false`. What a library draws, it draws from what the screen was handed: a screen still reads its data through `data` and its queries, and calls through the app's functions.

```tsx
import '@mantine/core/styles.css'
import { Button, MantineProvider } from '@mantine/core'
import { read, screen, useNonce } from 'tentjs/ui'
import { openOrders } from '../functions/orders'

export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  access: 'signedIn',
  data: { orders: read(openOrders) },
  view: ({ orders }) => {
    const nonce = useNonce()
    return (
      <MantineProvider getStyleNonce={() => nonce}>
        <Button>{orders.length} open</Button>
      </MantineProvider>
    )
  },
})
```

`topic.look` says how styles, Tailwind CSS, a library that writes its styles while it draws, dark mode, fonts, motion, icons and charts come in. Beside it:

- **A library that draws only in the browser**, as a chart that learns its size in an effect, draws an empty box of its size on the server, and its drawing once the page lives: give it a size, and nothing on the page moves. Where the first HTML must hold the chart, a chart library that draws on the server is the choice.
- **The inspect mode and the overlay** of a development build point at the tag of the screen file that used a library's component: a failure inside the library's own code is shown at the line of the screen that used it, and the library's own calls are folded as the library's.
- **Weight.** A heavy library makes a page heavier: `tent map` and `tent build` tell the bytes of each screen and each style file in the page, and nothing is refused for its size. A large library that only draws is drawn on the server alone with `browser: false` (`option.component.browser`), and the browser loads none of it.

## See also

`word.screen`, `word.component`, `word.read`, `tag.Link`, `tag.Form`, `tag.Image`, `topic.look`, `topic.plans`, `topic.build`, `hook.useNonce`, `option.project.html`, `code.T1005`, `code.T3007`, `code.T6008`
