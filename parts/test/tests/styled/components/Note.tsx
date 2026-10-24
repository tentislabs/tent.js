import { component, text } from 'tentjs/ui'
import { Boxed } from './boxed'
import './note.css'
import styles from './note.module.css'

// A component drawn on the server alone, with a style file, a CSS Module and a helper of its own that has one too.
export const Note = component('Note', {
  browser: false,
  props: { said: text() },
  view: ({ said }) => (
    <Boxed>
      <p className={`note ${styles.said}`} id="note">
        {said} (The marker of the note)
      </p>
    </Boxed>
  ),
})
