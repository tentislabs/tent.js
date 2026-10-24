import { useState } from 'react'
import { component, boolean, Form, Link } from 'tentjs/ui'
import { addOrder } from '../functions/orders'

export const Shown = component('Shown', {
  browser: false,
  state: { open: boolean() },
  view: () => (
    <Form call={addOrder}>
      <input name="total" />
      <Link set={{ open: true }}>Open</Link>
      <button type="button" onClick={() => undefined}>
        Add
      </button>
    </Form>
  ),
})

export const Hooked = component('Hooked', {
  browser: false,
  view: () => {
    const [n] = useState(0)
    return <span>{n}</span>
  },
})

export const other = 'more'
