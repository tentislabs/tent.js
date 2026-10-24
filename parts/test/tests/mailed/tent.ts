import { project } from 'tentjs'

// The app states who its mail is from, and no server: a test hands it a mailer, or reads its mailbox.
export const shop = project('shop', {
  title: 'Shop',
  mail: { from: { name: 'The Shop', address: 'shop@example.com' } },
  limits: { anyonePerMinute: 100000, callerPerMinute: 100000 },
})
