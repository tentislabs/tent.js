import { screen, useField, Form } from 'tentjs/ui'
import { addPhoto } from './functions'
import { picturesScreen } from './pictures'

/** The photo, a `file` field that `useField` drives: it uploads the file when it is picked. */
function Photo() {
  const f = useField('photo')
  return (
    <label>
      {f.label} <input {...f.input} />
      {f.help && <span>{f.help}</span>}
      {f.progress !== undefined && <progress value={f.progress} max={1} />}
    </label>
  )
}

// A form over a function with a file field: the photo is uploaded when it is picked, and the form sends its id.
export const uploadScreen = screen('uploadScreen', {
  path: '/upload',
  access: 'anyone',
  title: 'Upload',
  view: () => (
    <main>
      <Form id="handIn" call={addPhoto} then={{ goTo: picturesScreen }}>
        <label>
          Title <input name="title" />
        </label>
        <Photo />
        <button type="submit">Hand in</button>
      </Form>
    </main>
  ),
})
