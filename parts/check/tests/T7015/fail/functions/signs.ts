import { action, anyone, list, number, secrets, table, text } from 'tentjs'

export const users = table('users', { columns: { email: text({ unique: true }), roles: list(text()) }, access: { read: 'owner' } })

// The code opens the secret.
export const named = action('named', {
  access: anyone('a test reads how long a secret is'),
  output: number(),
  run: async () => secrets.PAY_KEY.reveal().length,
})
