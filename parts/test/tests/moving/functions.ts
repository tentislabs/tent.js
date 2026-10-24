import { anyone, change, input, text } from 'tentjs'
import { teams } from './tables'

export const addTeam = change('addTeam', {
  access: anyone('a test calls it'),
  input: { name: text() },
  set: teams.add({ name: input('name') }),
})
