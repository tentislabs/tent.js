import { anyone, flow, incoming, list, route, secret, table, text } from 'tentjs'

export const users = table('users', { columns: { roles: list(text()) }, access: { read: 'owner' } })

export const received = flow('received', { run: async ({ step }) => step('one', () => 1) })

export const formEvents = incoming('formEvents', {
  path: '/hooks/forms',
  verify: { scheme: 'standard', secret: secret('FORMS_HOOK') },
  then: received,
})

// A route that states `GET` shares the address: a provider first asks it a question.
export const formQuestion = route('formQuestion', {
  method: 'GET',
  path: '/hooks/forms',
  access: anyone('a provider asks here'),
  run: async () => new Response('here'),
})
