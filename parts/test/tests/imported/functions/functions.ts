import {
  action,
  boolean,
  caller,
  change,
  choice,
  date,
  day,
  file,
  importFile,
  input,
  number,
  object,
  role,
  text,
} from 'tentjs'
import { members, visits } from '../tables/tables'

// What every member that is imported passes: its types, the rule of the staff, and the unique name.
export const addMember = change('addMember', {
  access: role('staff'),
  input: {
    name: text({ min: 1 }),
    born: day(),
    height: number({ min: 0 }),
    joined: date(),
    team: choice(['red', 'blue'], { messages: 'teams' }),
    active: boolean({ optional: true }),
  },
  set: members.add({
    name: input('name'),
    born: input('born'),
    height: input('height'),
    joined: input('joined'),
    team: input('team'),
    active: input('active'),
    by: caller('id'),
  }),
})

export const addVisit = change('addVisit', {
  access: role('staff'),
  input: { name: text(), height: number() },
  set: visits.add({ name: input('name'), height: input('height') }),
})

// A member of the staff imports a file that they uploaded, as themselves.
export const importMembers = action('importMembers', {
  access: role('staff'),
  input: { members: file(), language: text({ optional: true }), dry: boolean({ optional: true }) },
  output: object({ run: text() }),
  run: async ({ input: given }) =>
    importFile(given.members, {
      with: addMember,
      map: { 'Full name': 'name' },
      ...(given.language === undefined ? {} : { language: given.language }),
      ...(given.dry === undefined ? {} : { dry: given.dry }),
    }),
})
