import { screen, Form } from 'tentjs/ui'
import { addOrder, pick } from './functions'

// A screen whose forms call a change and an action.
export const ordering = screen('ordering', {
  path: '/ordering',
  access: 'signedIn',
  view: () => (
    <main>
      <Form call={addOrder} aria-label="New order">
        <input name="title" />
        <input name="total" type="number" />
        <button type="submit">Save</button>
      </Form>
      <Form call={pick} aria-label="Pick a size">
        <select name="size">
          <option value="small">Small</option>
          <option value="large">Large</option>
        </select>
        <button type="submit">Pick</button>
      </Form>
    </main>
  ),
})
