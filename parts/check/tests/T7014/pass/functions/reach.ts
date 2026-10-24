import { action, anyone, get, list, number, object, service, table, text } from 'tentjs'

export const users = table('users', { columns: { email: text({ unique: true }), roles: list(text()) }, access: { read: 'owner' } })

// The server is a service: the code reaches it through its calls, and never by `fetch`.
export const weather = service('weather', {
  url: 'https://weather.example.com',
  calls: { today: get('/today', { input: { city: text() }, output: object({ degrees: number() }) }) },
})

export const reach = action('reach', {
  access: anyone('a test reaches a server'),
  input: { city: text() },
  output: number(),
  run: async ({ input }) => (await weather.today({ city: input.city })).degrees,
})
