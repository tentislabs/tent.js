import { action, json, keys, link } from 'tentjs'

// Code of the workspace's own: a function of the file, which the plain reader does not take.
function keyName(user: string): string {
  return `key of ${user}`
}

export const makeKey = action('makeKey', {
  about: 'Makes a key that acts for a user of the app',
  access: 'nobody',
  system: 'the test hands a visitor a key of the app',
  input: { user: link('users') },
  output: json(),
  run: async ({ input }) => keys.add({ name: keyName(input.user), user: input.user, scopes: ['*'] }),
})
