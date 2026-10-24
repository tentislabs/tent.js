import { list, query, table, text } from 'tentjs'

export const users = table('users', { columns: { name: text(), roles: list(text()) } })

// Which version answers: the test writes the second one anew.
export const which = query('which', {
  access: 'signedIn',
  input: {},
  output: text(),
  run: () => 'one',
})
