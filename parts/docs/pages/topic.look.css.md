# Style files and CSS Modules

A screen file, a component or a package imports a style file, and the build bundles it into the style file of the page, named in the head of its first HTML: a page never shows unstyled first, and a move to another screen loads that screen's style files before it draws. A style file read as a module, `*.module.css`, gives its class names, which Vite makes its own to the file.

```tsx
import { screen } from 'tentjs/ui'
import './orders.css'
import styles from './orders.module.css'

export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  access: 'signedIn',
  view: () => (
    <main className={styles.page}>
      <h1 className="title">Open orders</h1>
    </main>
  ),
})
```

The type checker takes such an import by the types the framework writes into `tent.d.ts`. A page loads the style files of its screen and of each component it draws, one that states `browser: false` among them, and no other: a component's own style file stays off the pages that do not draw it. A style file that several screens import stands in every page, once.

A look of the project's own CSS keeps its tokens in one place, as daisyUI does above: the colors, the steps of type and of spacing, the radii, each a custom property on `:root` in the one style file that the layout of every screen imports, the colors set anew under `@media (prefers-color-scheme: dark)`, and every component and screen naming `var(--space-4)` and never a value of its own. Reduced motion is held there too, with each animation inside `@media (prefers-reduced-motion: no-preference)`.
