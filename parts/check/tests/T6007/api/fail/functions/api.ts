import { change, list, number, query, route, table, text } from 'tentjs'

export const users = table('users', { columns: { roles: list(text()) }, access: { read: 'owner' } })

export const totals = query('totals', {
  access: 'signedIn',
  offer: ['api'],
  input: {},
  output: number(),
  run: () => 0,
})

export const addOrder = change('addOrder', {
  access: 'signedIn',
  offer: ['api'],
  input: { title: text() },
  run: () => undefined,
})

// A route at the address of an offered query, which the API answers by `GET`.
export const totalsRoute = route('totalsRoute', {
  method: 'GET',
  path: '/api/totals',
  access: 'signedIn',
  run: async () => new Response('the route'),
})

// A route that states `POST` at the address of an offered change.
export const addRoute = route('addRoute', {
  method: 'POST',
  path: '/api/addOrder',
  access: 'signedIn',
  run: async () => new Response('the route'),
})
