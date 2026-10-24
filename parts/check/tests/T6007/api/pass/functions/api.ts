import { list, number, query, route, table, text } from 'tentjs'

export const users = table('users', { columns: { roles: list(text()) }, access: { read: 'owner' } })

export const totals = query('totals', {
  access: 'signedIn',
  offer: ['api'],
  input: {},
  output: number(),
  run: () => 0,
})

// A route of the builder's own under `/api/`, at an address that no offered function has.
export const orderById = route('orderById', {
  method: 'GET',
  path: '/api/orders/:id',
  access: 'signedIn',
  run: async ({ params }) => Response.json({ id: params.id }),
})

// A route at the address of a function that is not offered to the API.
export const hidden = query('hidden', { access: 'signedIn', input: {}, output: number(), run: () => 1 })
export const hiddenRoute = route('hiddenRoute', {
  method: 'GET',
  path: '/api/hidden',
  access: 'signedIn',
  run: async () => new Response('the route'),
})
