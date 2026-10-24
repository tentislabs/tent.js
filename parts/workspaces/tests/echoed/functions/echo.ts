import { anyone, route } from 'tentjs'

// Code of the workspace's own, which runs in a box: it answers what the request it was handed carried, and as whom.
export const echo = route('echo', {
  method: 'GET',
  path: '/echo',
  access: anyone('a test reads what a request carried into the box'),
  run: ({ request, user }) =>
    Response.json({
      cookie: request.headers.get('cookie') ?? '',
      caller: request.headers.get('tent-caller') ?? '',
      user: user?.id ?? '',
    }),
})
