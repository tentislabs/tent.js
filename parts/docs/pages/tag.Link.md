# `Link`

A link that knows the screens of the app: one `<a>` whose address is the screen, the path or the place it goes to, written in the language of the page, which moves inside the page when it is pressed.

## Example

```tsx
import { screen, choice, read, Link } from 'tentjs/ui'
import { ordersByStatus } from '../functions/orders'
import { orderScreen } from './order'

export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  access: 'signedIn',
  state: { tab: { type: choice(['open', 'paid'], { default: 'open' }), in: 'address', back: true } },
  data: ({ state }) => ({ orders: read(ordersByStatus, { status: state.tab }) }),
  view: ({ orders }) => (
    <main>
      <nav className="tabs">
        <Link to={ordersScreen} with={{ tab: 'open' }}>Open</Link>
        <Link to={ordersScreen} with={{ tab: 'paid' }}>Paid</Link>
      </nav>
      <ul>
        {orders.map((o) => (
          <li key={o.id}>
            <Link to={orderScreen} with={{ id: o.id }}>{o.customer.name}</Link>
          </li>
        ))}
      </ul>
      <Link to="#help">How orders are paid</Link>
    </main>
  ),
})
```

## Properties

| Property | Does |
|---|---|
| `to` | Where it goes: a screen as the screen file imports it, a path of the app written or worked out (`` to={`/orders/${id}`} ``), or `'#<id>'`, a place on the screen that is shown. A path may hold the state of its screen after a question mark, `to="/shop?kind=textiles"`. A path is typed `` `/${string}` ``, and a place `` `#${string}` ``. A path written in place is typed so by the type checker; one that a property or a variable hands on is declared so where it is made, since a plain `string` is no path to it |
| `with` | The values of the screen's address and of the state it keeps in the address: `with={{ id: o.id }}`. A value that the screen does not take is `code.T6009` |
| `set` | Declared state that is set, then the move is made. Alone, with no `to`, it changes the state with no move |
| `prefetch` | What prefetches the screen before the press: `'hover'` (the default) when the pointer is over the link or it takes the focus, `'view'` when it comes into view, `'none'` never. What comes back is used by the move that follows |
| `keep` | The page stays where it is scrolled, and the focus on the link that was pressed: for a row of tabs that are screens |
| `above` | `true`, or `{ side }` of `'top'`, `'bottom'`, `'start'` and `'end'`: the screen opens over the one that is shown, in the browser's own dialog, with an address of its own |
| `exact` | The link is current on its own address alone, and not on one that lies under it |
| `language` | Beside `to`: goes to that screen in that language. Alone: shows the screen that is open in that language |

Every other property of an `<a>` reaches it: `className`, `style`, `id`, `onClick`, `target`, `rel`, a `ref`.

**A press.** A press that the browser would open elsewhere - with a key held, the middle button, or a `target` - is left to the browser. Any other press moves inside the page: the screen is asked for, the files it needs are loaded, and it is drawn, with the address and the browser's history changed. After the move the focus goes to the first `<h1>` of the new screen and the page is at its top, unless the link says `keep`.

**A step back.** The browser's back and forward buttons, and `history.back()`, draw the screen of that step with the page where it stood when the step was left, and move the focus nowhere: it stays where it was. A screen whose heading should take the focus after such a step gives it itself, on the browser's `popstate` event, with `tabIndex={-1}` on the heading and `focus({ preventScroll: true })`.

**A screen above.** A link that states `above` opens its screen inside the browser's own `<dialog>`, made modal, over the screen that is shown: the page underneath stays where it was scrolled, and takes no press, key or reader until the dialog closes. The dialog is named by the title of its screen. Escape and a press on the backdrop close it, which puts the address of the screen underneath back. It carries no class of its own: a style names it as `dialog[aria-modal="true"]`, and what lies behind it as `dialog[aria-modal="true"]::backdrop`. `{ side }` sets its margin on that side to 0, so it stands against that edge, and the style gives it the height or the width of a sheet:

```css
dialog[aria-modal="true"] {
  border: 0;
  border-radius: 12px;
  padding: 24px;
  width: min(32rem, 100% - 32px);
}
dialog[aria-modal="true"]::backdrop {
  background: rgb(0 0 0 / 0.4);
}
```

**The current one.** While what is shown is where it goes, the link carries `aria-current="page"`: the same screen, with every value of its `with` equal to the one that is shown, or an address that lies under its own (`/orders/42` lies under `/orders`; nothing but `/` lies under `/`). So of three tabs that are links, one is current. A value of `with` that is `undefined` must be equal too: a link to the first page of a list that other pages carry in the address, `with={{ after: undefined }}`, is current on the first page alone (`topic.screens.lists`). A style names it as `[aria-current="page"]`, and Tailwind CSS as `aria-[current=page]:`. A screen reader is told by the attribute itself. A link back to a list is current on the screens under it: "Back to orders" on `/orders/42`. Where the style draws a current link as pressed, as daisyUI draws a current `btn`, such a link states `exact`.

**Addresses.** A path starts with one `/`, and holds no `//`, no `\` and no control character, as it is written or with its percent signs read. A path that breaks the rule is refused: written in place, by `tent check` (`code.T6013`); worked out while running, by the link, which then draws no address and makes no move. An address outside the app is a plain `<a href>` of the view's own.

## Errors

`code.T6009`: a value in `with` that the screen does not take. `code.T6011`: `set` names a state that is not declared, or a value of the wrong type. `code.T6013`: a path written in place that is not allowed.

## See also

`hook.useGoTo`, `tag.Form`, `word.screen`, `topic.screens`
