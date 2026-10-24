import { flow, incoming, list, secret, table, text } from 'tentjs'

export const users = table('users', { columns: { roles: list(text()) }, access: { read: 'owner' } })

export const received = flow('received', { run: async ({ step }) => step('one', () => 1) })

export const signedEvents = incoming('signedEvents', {
  path: '/hooks/signed',
  verify: { scheme: 'github', secret: secret('GITHUB_HOOK') },
  then: received,
})

// Open on purpose, with the reason.
export const openEvents = incoming('openEvents', {
  path: '/hooks/open',
  open: 'the sender cannot sign, and the flow only counts what arrives',
  then: received,
})
