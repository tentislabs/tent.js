import { route } from 'tentjs'

// A route that answers the rest of its address as it was handed it.
export const docs = route('docs', {
  method: 'GET',
  path: '/docs/*',
  access: 'anyone',
  run: ({ params }) => new Response(params.rest),
})
