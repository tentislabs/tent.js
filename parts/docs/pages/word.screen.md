# `screen`

One page of the app at an address. It is written in a `.tsx` file that imports `tentjs/ui`, states who may see it and what it reads, and holds a `view`, a React component.

## Example

```tsx
import { screen, read, Link } from 'tentjs/ui'
import { openOrders } from '../functions/orders'
import { orderScreen } from './order'
import './orders.css'

export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  title: 'Open orders',
  access: 'signedIn',
  data: { orders: read(openOrders, { limit: 50 }) },
  view: ({ orders }) => (
    <main className="orders">
      <h1>Open orders</h1>
      <ul>
        {orders.map((o) => (
          <li key={o.id}>
            <Link to={orderScreen} with={{ id: o.id }}>
              {o.customer}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  ),
})
```

A screen file imports `tentjs/ui` and nothing from `tentjs`. A query, a change or an action that it imports from a backend file reaches it as its name and its input alone: the screen hands it to `read`, to `useQuery`, to `useCall` or to a `Form`, and never calls it (`code.T6008`). The name of a screen is camelCase, and the export has the same name.

The `view` is handed each name of `data`, and beside them `params` (the values of the address, as text), `state` (the declared state), `user` (`{ id, roles }`, or nothing for a visitor on a screen that lets visitors in), `language`, `settings` (the public ones), `calls` (what the calls of the view are doing), `set` and `above`. None of these names may be a name of `data` or of `state`.

`set` takes a record of declared states, each with its new value, and changes them as a press does: `<input value={state.search} onChange={(e) => set({ search: e.target.value })} />`. A state kept in the address is written into the address at once, with no reload, and every entry of `data` whose input reads a state that changed is asked again (`option.screen.state`). A value reaches a view as it travelled: a `date` is text in the standard form, `'2026-10-08T09:30:00.000Z'`, and never a `Date`.

A view is a React component, built into a module for the browser and one for the server. It writes elements of HTML, components of the project's files and of any package, and the three tags `Link`, `Form` and `Image`, and its look is any CSS (`topic.look`). What the build stores of a screen as values is its `data`, its `title` and its search-engine fields, where each holds only our words.

## Options

| Option | Means |
|---|---|
| `option.screen.path` | The address of the screen. |
| `option.screen.for` | Makes the screen one of the four special screens, in place of an address. |
| `option.screen.view` | The React component that draws the screen. |
| `option.screen.access` | Who may be shown the screen. |
| `option.screen.title` | The title of the page. |
| `option.screen.about` | One sentence on what the screen is for. |
| `option.screen.data` | What the screen reads before it is drawn. |
| `option.screen.state` | The state that the screen keeps: in the page, in the address, or in the browser. |
| `option.screen.layout` | The component that the screen is shown in: its layout. |
| `option.screen.loading` | The component that is shown while a move to another screen takes time. |
| `option.screen.cache` | How long the drawn screen is kept for the next visitor. |
| `option.screen.server` | Whether the screen is drawn on the server for the first HTML. |
| `option.screen.seo` | What search engines and shared links are told of the screen. |
| `option.screen.head` | More lines of the head of the page. |
| `option.screen.offer` | The outside doors the screen is offered to. |
| `option.screen.framedBy` | Which other sites may show the screen in a frame. |
| `option.screen.was` | The old name of the screen, where it was renamed. |

## Returns

A record that carries the name, the kind `'screen'` and the options. The build reads it, and nothing calls it. Another screen file imports it to go there: `<Link to={ordersScreen}>`.

## Errors

`code.T1003`: an option that `screen` does not have.

`code.T1007`: `path` and `for` are both stated.

`code.T1008`: `view` or `access` is left out, or neither `path` nor `for` is stated.

`code.T1009`: a name of `data` or of `state` is one of the names every view is handed.

`code.T1013`: the name is not camelCase letters and digits.

`code.T1014`: a value that is not allowed: an address that could never be reached, a state that its place cannot hold, a line of the head that is none of the three.

## See also

`word.component`, `word.read`, `tag.Link`, `tag.Form`, `topic.screens`, `topic.look`
