import { route } from 'tentjs'

// A route may lie under `/api/`, and wherever no address of the engine and no language lies.
export const orderApi = route('orderApi', {
  method: 'GET',
  path: '/api/orders/:id',
  access: 'signedIn',
  run: async ({ params }) => Response.json({ id: params.id }),
})

export const tools = route('tools', {
  method: 'GET',
  path: '/_tools/list',
  access: 'anyone',
  run: async () => new Response('tools'),
})

export const english = route('english', {
  method: 'GET',
  path: '/english/words',
  access: 'anyone',
  run: async () => new Response('words'),
})
