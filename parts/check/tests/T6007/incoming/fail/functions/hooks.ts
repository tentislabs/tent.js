import { anyone, flow, incoming, list, route, secret, table, text } from 'tentjs'

export const users = table('users', { columns: { roles: list(text()) }, access: { read: 'owner' } })

export const received = flow('received', { run: async ({ step }) => step('one', () => 1) })

export const formEvents = incoming('formEvents', {
  path: '/hooks/forms',
  verify: { scheme: 'standard', secret: secret('FORMS_HOOK') },
  then: received,
})

// A second call coming in at the address of the first: one of the two could never be reached.
export const formAgain = incoming('formAgain', {
  path: '/hooks/forms',
  open: 'the forms post here too',
  then: received,
})

// A route that states `POST` at the address of a call coming in.
export const formRoute = route('formRoute', {
  method: 'POST',
  path: '/hooks/forms',
  access: anyone('a provider posts here'),
  run: async () => new Response('taken'),
})
