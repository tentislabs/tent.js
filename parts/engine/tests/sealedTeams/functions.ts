import { anyone, change, input, query, text } from 'tentjs'
import { teams, vault } from './tables.ts'

const open = anyone('a test calls it')

export const addTeam = change('addTeam', {
  access: open,
  input: { name: text() },
  set: teams.add({ name: input('name') }),
})

export const keep = change('keep', {
  access: open,
  input: { team: text(), title: text(), note: text() },
  set: vault.of(input('team')).add({ title: input('title'), note: input('note') }),
})

export const kept = query('kept', {
  access: open,
  input: { team: text() },
  rows: vault.of(input('team')).oldest('title'),
})
