# Screen files and stubs

A screen file is a `.tsx` file that imports `tentjs/ui`. It holds screens and components, each a top-level `export const` made with `word.screen` or `word.component`, whose exported name is its stated name, beside any React components of its own. It imports nothing from `tentjs`: `tentjs/ui` gives the types and the rule helpers `role` and `anyone` too.

```tsx
import { screen, read, Form, Link } from 'tentjs/ui'
import { openOrders, markPaid } from '../functions/orders'
import { orderScreen } from './order'
import styles from './orders.module.css'

export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  access: 'signedIn',
  data: { orders: read(openOrders, { limit: 50 }) },
  view: ({ orders }) => (
    <ul className={styles.list}>
      {orders.map((o) => (
        <li key={o.id}>
          <Link to={orderScreen} with={{ id: o.id }}>
            {o.customer.name}
          </Link>
          <Form call={markPaid} with={{ order: o.id }}>
            <button type="submit">Paid</button>
          </Form>
        </li>
      ))}
    </ul>
  ),
})
```

## A view is React

A view is a React component: it is built into a module for the browser and one for the server, and drawn as React draws it. It writes elements of HTML, components of the project's files and of any package, and the three tags of the framework, each of which knows something of the engine: `tag.Link` the screens, `tag.Form` the function it calls, `tag.Image` the image door. Its look is any CSS: a style file it imports, a CSS Module, Tailwind CSS by its Vite plugin, a library that writes its styles while it draws (`topic.look`).

A view may import React's own hooks from `react`, `useState`, `useRef`, `useEffect` and the rest, and what they keep is the view's own. In development a save that changes the look alone keeps it: the view is swapped in place by React's Fast Refresh, with its data, its declared state, the address and the scroll. Every other save, as one of its `data` or its `state`, or of a backend file, starts the views anew: what they keep in React starts from its first values, and what they declare as `state` stays. A file that holds `// @refresh reset` starts its views anew at every save, and the mark "state kept" that a swap shows resets the shown screen with a press (`command.dev`).

What the build reads of a screen as values is its `data`, its `title` and its search-engine fields, where each holds only our words; anything else makes that field code, and `tent check` says what made it so, with its line. So the engine knows what each screen reads. With no script a screen is still the first HTML with its rows, a `Link` that is an `<a>` with its address, and a `Form` that is a real form that posts.

## What a screen file is handed of a backend file

When a screen file imports a backend file, the build puts a made file in its place, in the browser and on the server alike. It gives, under the same names, one frozen record for each definition, a stub:

| Definition | Its stub |
|---|---|
| A query | `{ definition, kind: 'query', input, live }`: its name, the types of its input, and whether it is live |
| A change, an action | `{ definition, kind, input }` |
| A flow that states `access` | `{ definition, kind: 'flow', input }` |
| Anything else | `{ definition, kind }`: a table, any other flow, a service, a model, the project |
| A screen, imported from another screen file | `{ definition, kind: 'screen', path, state }`: its address, and the names of the state it keeps in the address |

A stub holds no rule, no code and no output, so nothing else of a backend file reaches a browser, whoever imports it: a screen file, a helper file between the two, or a package. A stub is a record and never a function. A screen uses one by handing it on: to `word.read` in `data`, to `hook.useQuery` and `hook.useCall`, to `call` of a `Form`, and to `to` of a `Link`. A screen file that calls a function itself is `code.T6008`. The types that a screen file sees are those of the real definition.

## When a page has come alive

A page is sent as HTML that already shows the screen, and comes alive when its page code has loaded: from then on a press is taken and a form is sent by the page. The element with the id `tent`, which holds the drawing, carries `data-t-alive` from that moment. A test that drives a real browser waits for it before it presses: `await page.locator('#tent[data-t-alive]').waitFor()`.

From then on the page follows its data. Each entry of `data` and each `useQuery` that reads a query is watched over one connection to the engine, and the screen is drawn again when a row that it read is written, by this page or by anyone else. A query that states `live: false`, and an action, is asked again after each call of the page that worked. `topic.live` says what a page is sent, and what it does when its connection is lost.

A view that fails while the browser draws it leaves no empty page: the failure is taken, and the `error` screen is drawn in the place of the view. In the modes `development` and `test` it shows the failure itself, and on live data the words that any caller sees of one. An action or a `heavy` query that is still not answered when the server has drawn the screen five times (`limits.drawPasses` of `project`) is asked by the page when it has come alive, and the view is drawn when its answer is there.
