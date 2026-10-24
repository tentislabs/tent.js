import { allow, change, fail, link, list, number, query, role, table, text, where } from 'tentjs'

const MOST = 20

export const users = table('users', { columns: { roles: list(text()) }, access: { read: 'owner' } })

export const teams = table('teams', { columns: { name: text() }, access: { read: 'signedIn', add: role('staff') } })

export const members = table('members', {
  columns: { team: link('teams'), user: link('users') },
  access: { read: where((user, db) => ({ team: { in: db.members.where({ user: user?.id }).pick(['team']) } })) },
})

export const teamSize = query('teamSize', {
  access: allow((user, input: { team: string }, db) => db.members.where({ team: input.team, user: user?.id }).count() > 0),
  input: { team: link('teams') },
  output: number(),
  run: ({ input, db }) => {
    const size = db.members.where({ team: input.team }).count()
    if (size > MOST) fail('too-many', 'This team is full.')
    return size
  },
})

export const addMember = change('addMember', {
  access: role('staff'),
  input: { team: link('teams'), user: link('users') },
  run: ({ input, db }) => {
    if (teamSize({ team: input.team }) >= MOST) fail('too-many', 'This team is full.')
    db.members.add({ team: input.team, user: input.user })
  },
})
