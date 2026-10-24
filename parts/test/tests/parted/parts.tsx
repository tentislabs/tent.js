import { component, read, text } from 'tentjs/ui'
import { allNotes, userById } from './functions'

// A part drawn on the server alone: its words are in the first page, and no browser file holds its module.
export const Notes = component('Notes', {
  browser: false,
  props: { heading: text() },
  data: { notes: read(allNotes) },
  view: ({ heading, notes, children }) => (
    <div id="notes" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <h2 id="heading">{heading}</h2>
      <span id="marker">The marker of the plain part</span>
      {notes.map((o) => <span key={o.id}>{o.title}</span>)}
      {children}
    </div>
  ),
})

// A part that reads one user by an id that its use gives it.
export const Who = component('Who', {
  browser: false,
  props: { id: text() },
  data: ({ props }) => ({ found: read(userById, { id: props.id }) }),
  view: ({ found }) => <span id="who">{found ? found.email : 'nobody'}</span>,
})
