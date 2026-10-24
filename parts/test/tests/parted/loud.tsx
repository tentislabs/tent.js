import { component, read, text } from 'tentjs/ui'
import { allNotes } from './functions'
import { loud } from './heavy'

// A part whose view is code, since it calls a helper of its file: the browser is given its record and no view.
export const Loud = component('Loud', {
  browser: false,
  props: { said: text() },
  data: { notes: read(allNotes) },
  view: ({ said, notes, children }) => (
    <div id="loud" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span id="said">{loud(said)}</span>
      {notes.map((o) => <div key={o.id} className="body" dangerouslySetInnerHTML={{ __html: o.body }} />)}
      {children}
    </div>
  ),
})
