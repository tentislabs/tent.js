import { screen, Form } from 'tentjs/ui'
import { addNote } from '../functions/notes'

// A function of its own draws the form: the build reads what the file imports, not where it is drawn.
function Later() {
  return (
    <Form call={addNote}>
      <input name="text" />
    </Form>
  )
}

export const sketchScreen = screen('sketchScreen', {
  path: '/sketch',
  access: 'anyone',
  view: () => (
    <main>
      <Later />
    </main>
  ),
})
