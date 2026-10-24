import { screen, component, read, boolean, number, text, Form } from 'tentjs/ui'
import { addOrder, allNotes, openOrders } from '../functions/orders'

export const notesScreen = screen('notesScreen', {
  path: '/notes',
  access: 'anyone',
  cache: { for: 60_000, public: true },
  state: { seen: { type: boolean(), in: 'device' } },
  data: { notes: read(allNotes) },
  view: ({ notes, user, state }) => (
    <span>
      {notes.length} {user ? user.id : ''} {state.seen ? 'seen' : ''}
    </span>
  ),
})
