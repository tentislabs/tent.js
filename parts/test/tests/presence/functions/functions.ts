import { anyone, boolean, change, input, query, text } from 'tentjs'
import { presence } from '../tables/tables'

const open = anyone('a test calls it')

export const here = change('here', {
  access: open,
  input: { user: text(), doc: text(), shown: boolean({ optional: true }) },
  set: presence.add({ user: input('user'), doc: input('doc'), shown: input('shown') }),
})

export const typing = change('typing', {
  access: open,
  input: { id: text() },
  set: presence.change(input('id'), { typing: true }),
})

export const whoIsHere = query('whoIsHere', { access: open, rows: presence.oldest('createdAt').limit(100) })
