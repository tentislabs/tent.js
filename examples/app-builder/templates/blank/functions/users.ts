import { change, link, object, text } from 'tentjs'

export const addUser = change('addUser', {
  about: 'Finds the row of a person of the product, and adds it the first time they open this app',
  access: 'nobody',
  input: { email: text({ max: 254 }) },
  output: object({ id: link('users') }),
  run: ({ input, db }) => db.users.where({ email: input.email }).first() ?? db.users.add({ email: input.email }),
})
