# `useCall`

Calls a change, an action, a flow that is offered, an agent or a member of one from the code of a view.

## Example

```tsx
import { screen, useCall } from 'tentjs/ui'
import { markPaid } from '../functions/orders'

export const payScreen = screen('payScreen', {
  path: '/pay/:id',
  access: 'signedIn',
  view: ({ params }) => {
    const pay = useCall(markPaid)
    const press = async () => {
      const order = await pay.call({ order: params.id })
      console.log('paid', order)
    }
    return (
      <div className="pay">
        <button type="button" onClick={press} disabled={pay.busy}>
          {pay.held ? 'Waiting for the network' : pay.busy ? 'Paying' : 'Mark paid'}
        </button>
        {pay.error && <p role="alert">{pay.error.message}</p>}
      </div>
    )
  },
})
```

## Takes

`useCall(fn, options)`: what it calls, as the screen file imported it, and `{ optimistic }`, which shows the result of the call before the engine has answered.

`optimistic` is `{ query, to }`, or `false`: a query as the screen file imported it, and a function that is handed what the query answers now and the input of the call, and answers what the query will answer once the call has worked.

A change whose body is plain needs no `optimistic`: the page works its own plan over the rows it holds of the plain queries of the screen, so a row it adds stands at once in each list whose filter it fits, in its sorted place, a row it sets shows its new values, and a row it removes is gone, each a row for which `optimistic(row)` is true until the answer comes, when the real row takes its place. A query that counts, joins, reads with `system` or is code is not shown ahead, nor is an action. `optimistic: false`, and `optimistic={false}` of a `Form`, show nothing ahead. A call the engine refuses takes back what was shown.

```tsx
const pay = useCall(markPaid, {
  optimistic: { query: openOrders, to: (rows, input) => rows.filter((row) => row.id !== input.order) },
})
```

The optimistic result is shown the moment `call` is made, for every use of that query on the page, whatever its input. It is dropped when an answer of that query arrives after the call was answered, or two seconds after the answer, whichever comes first, and at once when the call fails. `to` changes no answer that the page holds: it is worked out over the held answer each time the query is read.

## Returns

`{ call, busy, held, error, value }`. `call(input)` sends the call through the door and answers a promise of the answer, typed by the function's own input and answer. `busy` is true while a call is under way. `held` is true while the page holds the call for want of a connection, and it goes when the connection is back; a held call is busy too (`code.T0036`). A failure refuses the promise with the error as a caller sees it, `{ code, name, message, fields, ref }`, which is in `error` too, and `error` is nothing again while the next call is under way. `value` is the answer of the last call that worked. A second call while one is busy is the view's to refuse, by `disabled={busy}` on its button.

After a call that worked, the page asks again every query it shows that is not live. A live query needs nothing: the engine sends the page what the call changed (`topic.live`).

## See also

`tag.Form`, `hook.useQuery`, `word.optimistic`, `topic.screens`, `topic.live`
