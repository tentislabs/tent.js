import { anyone, change, input, text } from 'tentjs'
import { people, tasks, teams } from '../tables/tables'

const open = anyone('a test calls it')

export const addTeam = change('addTeam', {
  access: open,
  input: { name: text() },
  set: teams.add({ name: input('name') }),
})

export const addPerson = change('addPerson', {
  access: open,
  input: { fullName: text() },
  set: people.add({ fullName: input('fullName') }),
})

export const addTask = change('addTask', {
  access: open,
  input: { team: text(), title: text() },
  set: tasks.of(input('team')).add({ title: input('title') }),
})
