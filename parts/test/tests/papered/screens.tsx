import { Form, screen, useField } from 'tentjs/ui'
import { addPaper } from './functions'

// A field of files of the browser's own, as a person writes one.
export const homeScreen = screen('homeScreen', {
  path: '/',
  access: 'signedIn',
  title: 'Papers',
  view: () => (
    <main>
      <h1>Papers</h1>
      <Form call={addPaper}>
        <label>
          Title <input name="title" />
        </label>
        <label>
          Paper <input name="paper" type="file" />
        </label>
        <button type="submit">Add</button>
      </Form>
    </main>
  ),
})

/** The paper, a field of files that `useField` drives. */
function Paper() {
  const f = useField('paper')
  return (
    <label>
      {f.label} <input {...f.input} />
    </label>
  )
}

// The same form, with the field of files that `useField` drives.
export const drivenScreen = screen('drivenScreen', {
  path: '/driven',
  access: 'signedIn',
  title: 'Papers',
  view: () => (
    <main>
      <h1>Papers</h1>
      <Form call={addPaper}>
        <label>
          Title <input name="title" />
        </label>
        <Paper />
        <button type="submit">Add</button>
      </Form>
    </main>
  ),
})
