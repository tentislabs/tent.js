import { request } from 'node:https'
import { action, anyone, list, number, table, text } from 'tentjs'

export const users = table('users', { columns: { email: text({ unique: true }), roles: list(text()) }, access: { read: 'owner' } })

// The code reaches out itself, by `fetch` and by a network module of the runtime.
export const reach = action('reach', {
  access: anyone('a test reaches a server'),
  input: { address: text() },
  output: number(),
  run: async ({ input }) => {
    const answer = await fetch(input.address)
    request(input.address).end()
    return answer.status
  },
})
