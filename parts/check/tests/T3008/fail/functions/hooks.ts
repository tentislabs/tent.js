import { flow, incoming, list, table, text } from 'tentjs'

export const users = table('users', { columns: { roles: list(text()) }, access: { read: 'owner' } })

export const received = flow('received', { run: async ({ step }) => step('one', () => 1) })

// A call coming in that states neither `verify` nor `open`: whoever finds the address starts the flow.
export const unsigned = incoming('unsigned', { path: '/hooks/unsigned', then: received })
