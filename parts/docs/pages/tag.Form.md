# `Form`

A form over a function of the app: any named control inside it is a field, it checks what it sends against the types of the function's input before it calls, tells each field its failure, and sends with no script too.

## Example

```tsx
import { screen, read, useField, Form } from 'tentjs/ui'
import { addOrder, allCustomers } from '../functions/orders'
import { orderScreen } from './order'

function NoteField() {
  const f = useField('note')
  return (
    <label>
      {f.label} <textarea {...f.input} />
      {f.error && <span id={f.errorId}>{f.error}</span>}
    </label>
  )
}

export const newOrderScreen = screen('newOrderScreen', {
  path: '/orders/new',
  access: 'signedIn',
  data: { customers: read(allCustomers) },
  view: ({ customers, calls }) => (
    <Form id="add" call={addOrder} with={{ source: 'web' }} then={(order) => ({ goTo: orderScreen, with: { id: order.id } })}>
      <label>
        Customer
        <select name="customer">
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </label>
      <label>
        Total <input name="total" type="number" />
      </label>
      <NoteField />
      <button type="submit" disabled={calls.add.busy}>Add order</button>
    </Form>
  ),
})
```

## Properties

| Property | Does |
|---|---|
| `call` | A change, an action, a flow that is offered, an agent or a member of one, as the screen file imported it. Its input is what the fields hold, joined with `with` |
| `with` | Values the person does not type. A name that a field gives too is `code.T6009` |
| `values` | What its fields start with. One given here wins over the default of the type, and a field with a dotted name is given inside its record: `values={{ address: { city: 'Izmir' } }}`. A field the person has not touched follows a later change of it; one they touched keeps what they typed |
| `then` | What follows a send that worked: `{ goTo, with, set, above, href }`, or an arrow that is handed the answer of the call: `then={(order) => ({ goTo: orderScreen, with: { id: order.id } })}`. A `goTo` or a `set` that is nothing does nothing. A `goTo` takes what `to` of a `Link` takes: a path is typed `` `/${string}` ``. A path worked out in place, `` { goTo: `/orders/${order.id}` } ``, is typed so by the type checker; one that is held as a plain `string` is refused, and is declared `` `/${string}` `` where it is made |
| `reset` | What is emptied after a send that worked: `true` (the default) puts every field back at its start, `false` none, and a list of names only those: `reset={['password']}` |
| `sendOnEnter` | True when left out: Enter in a field of one line sends the form. `false` keeps Enter from sending it, for a field that adds a tag on Enter |
| `optimistic` | `false` turns off the optimistic result of a change that is plain |
| `id` | The view reads the form as `calls.<id>`: `busy`, `error` and `value`. It names the form in a send with no script, so a form inside a list states one of its own: `id={'pay-' + o.id}` |
| `children` | What the form holds: its fields, each by its `name`, its buttons, and any other element |

Every other property of a `<form>` reaches it: `className`, `style`, `aria-label`.

**Fields.** A field is any named control inside the form: a native `<input>`, `<select>` or `<textarea>`, a library's control that renders a named native input, and a component that calls `useField` (`hook.useField`). A control's `name` names a field of the function's input; a dotted name reaches into an `object`: `name="address.city"`. Each value is read by its type: a number from its text, a tick as true or false, a moment in the viewer's time zone, a list of picked entries.

**A send.** Enter in a field of one line, and a button of the form whose `type` is `submit`, send it. While a send is under way the form is busy and takes no second one. Before it sends, the form checks each value against the check that the build made of the function's input, and calls nothing while one fails: a field that `useField` drives is told its words through `error` and `invalid`, with `aria-invalid` on its control; a native control is told by the browser's own validity, which shows the words beside it. The first field that failed takes the focus. The door checks again.

The messages of a failed check, under the keys a language file may give anew:

| Key | English |
|---|---|
| `tent.required` | This is needed. |
| `tent.type` | This is not a valid value. |
| `tent.min`, `tent.max` | At least {min}. At most {max}. |
| `tent.pattern` | This does not have the right form. |
| `tent.values` | Pick one of the choices. |
| `tent.failed` | Something went wrong. Try again. |

A function that says no fails with `fail('taken', 'That name is taken.', { fields: { name: 'That name is taken.' } })`, and the form shows those words at that field. A failure that names no field of the form is in `calls.<id>.error`, and the form tells it after its last field.

**With no script.** The first HTML is a real form that posts to `/_t/form/<the function>`, with the address of its screen, the form and the version in hidden fields, and what `with` gives under its own names, so a visitor with no script can send it. The engine finds the form and its `then` in the screen as it is drawn before the call, and when the call worked the visitor is sent where that `then` goes, an arrow among them, in the language of the page; a `then` that only sets a state sends the visitor back to the screen, with each state that its address keeps as the `set` leaves it, and one with neither back to the screen: also where the call took the form away, as a delete on its own row does. A form with no `id` is named by its number among all the forms of the screen, so a form inside a list states an `id` of its own. When it failed, the screen is drawn again with the words of each field and what was typed, a password left out. A request there that carries a cookie of the app must come from the app's own `Origin` (`code.T0004`).

## Errors

`code.T0002`: the door found a value that does not fit its type; the form shows it at its field. `code.T0004`: a form posted from another site with the visitor's cookie. `code.T6009`: a `name` written in place that the function does not take, a name that `with` gives too, or a name in `values` or `reset` that is no field. `code.T6013`: a literal address of `then` that is not allowed.

## See also

`hook.useField`, `hook.useCall`, `tag.Link`, `word.screen`
