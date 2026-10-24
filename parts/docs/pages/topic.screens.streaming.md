# A page that streams its slow parts

A screen's own `data` is always there before anything is sent: the status and the title hang on it, so a `needed` entry that answers nothing is still a 404. A component that reads its own slow data - an action, or a `heavy` query - need not hold the whole page back. Where what the components wait for has not answered once the server has drawn for 50 ms, the page is sent at once with the screen's `loading` component, or nothing, in the place of each component that waits, and the answer stays open. As each one answers, the server draws that component and sends it into the same answer with one line of script that puts it in its place, so the visitor sees it before the page code has loaded, and the page takes its answer as one that came with the first HTML.

```tsx
import { component, read, screen } from 'tentjs/ui'
import { recentOrders, yearlyTotals } from '../functions/orders'

export const Spinner = component('Spinner', { view: () => <p aria-busy="true">Counting</p> })

export const Totals = component('Totals', {
  data: { totals: read(yearlyTotals) },
  view: ({ totals }) => <p>{totals.sum}</p>,
})

export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  access: 'signedIn',
  loading: Spinner,
  data: { orders: read(recentOrders) },
  view: ({ orders }) => (
    <main>
      <p>{orders.length} orders</p>
      <Totals />
    </main>
  ),
})
```

A component whose entry fails while it is streamed draws its error, as it would read `calls.<entry>.error` in any draw, and the rest of the page stands. With scripts switched off each part shows at the end of the page. What has not come within `limits.streamTime` of `project` (30 seconds) is left empty, and the page asks it once it has come alive. A page that is asked for by a program and not a browser, a page that `tent export` writes, and one cached with `public` are drawn whole and sent at once.
