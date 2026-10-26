import { screen, Form } from 'tentjs/ui'
import { addNote } from '../functions/note'
import { pictureAt } from '../lib/at'

// A screen whose picture the browser loads from another host, with a form that a case of the declarations sends.
export const pictured = screen('pictured', {
  path: '/pictured',
  access: 'signedIn',
  view: () => (
    <main>
      <img src={pictureAt} alt="From another host" />
      <Form call={addNote} aria-label="New note">
        <input name="words" />
        <button type="submit">Save</button>
      </Form>
    </main>
  ),
})
