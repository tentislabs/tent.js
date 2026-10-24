import { action, anyone, mail, secrets } from 'tentjs'

const open = anyone('a test is answered a code that has no status')

// The project states no mail and the engine connects no mailer: T0020.
export const noMail = action('noMail', {
  access: open,
  run: async () => mail.send({ from: 'shop@example.com', to: 'ada@example.com', subject: 'Hello', text: 'Hello' }),
})

// A member of full access in an action that states no `system`: T0013 to a browser; as the system, with no key at hand, T0019.
export const setSecret = action('setSecret', {
  access: open,
  run: async () => secrets.set('A_SECRET', 'a value'),
})
