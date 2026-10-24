import { action, anyone, list, secrets, table, text } from 'tentjs'

export const users = table('users', { columns: { email: text({ unique: true }), roles: list(text()) }, access: { read: 'owner' } })

// The secret is written out wrapped, and never opened.
export const named = action('named', {
  access: anyone('a test reads what a secret reads as'),
  output: text(),
  run: async () => String(secrets.PAY_KEY),
})
