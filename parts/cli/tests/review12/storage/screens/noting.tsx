import { screen, Form } from 'tentjs/ui'
import { addNote } from '../functions/note'

// A screen whose page clears what it keeps for the tab and loads again, as a sign-out does, and then sends a form.
export const noting = screen('noting', {
  path: '/noting',
  access: 'signedIn',
  view: () => (
    <main>
      <Form call={addNote} aria-label="New note">
        <input name="words" aria-label="Words" />
        <button type="submit">Save</button>
      </Form>
      <button
        type="button"
        onClick={() => {
          sessionStorage.clear()
          location.reload()
        }}
      >
        Start over
      </button>
    </main>
  ),
})
