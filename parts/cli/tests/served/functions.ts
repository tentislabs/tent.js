import { action, anyone, change, connections, file, get, json, keys, list, query, secret, service, table, text } from 'tentjs'

export const users = table('users', {
  columns: { name: text(), roles: list(text()) },
  access: { read: 'signedIn' },
})

export const hello = query('hello', {
  about: 'Greets the caller',
  access: 'signedIn',
  offer: ['cli'],
  input: {},
  output: text(),
  run: ({ user }) => `hello ${user?.id ?? 'a key'}`,
})

export const keepDoc = action('keepDoc', {
  about: 'Keeps a file and answers its id',
  access: 'signedIn',
  offer: ['cli'],
  input: { doc: file() },
  output: text(),
  run: async ({ input }) => input.doc,
})

export const makeKey = action('makeKey', {
  access: anyone('a test makes the keys it uses'),
  system: 'makes keys for the tests',
  input: { name: text() },
  output: json(),
  run: async ({ input }) => keys.add({ name: input.name, scopes: ['*'] }),
})

export const addUser = change('addUser', {
  access: 'nobody',
  input: { name: text(), roles: list(text()) },
  run: ({ input, db }) => db.users.add({ name: input.name, roles: input.roles }),
})

export const makeUserKey = action('makeUserKey', {
  access: anyone('a test makes the keys of a user'),
  system: 'makes keys for the tests',
  input: { user: text() },
  output: json(),
  run: async ({ input }) => keys.add({ name: 'of a user', user: input.user, scopes: ['*'] }),
})

export const listKeys = action('listKeys', {
  access: anyone('a test reads the keys'),
  system: 'lists keys for the tests',
  input: {},
  output: list(text()),
  run: async () => keys.list().map((one) => one.name),
})

export const listConnections = action('listConnections', {
  access: anyone('a test reads the connections of a user'),
  system: 'lists the connections of a user for the tests',
  input: { user: text() },
  output: list(text()),
  run: async ({ input }) => connections.list(input.user).map((one) => one.service),
})

// A service whose auth is `oauth`: a person's connections to it go with the person.
export const github = service('github', {
  url: 'https://api.github.com',
  auth: {
    oauth: {
      authorizeUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      clientId: secret('GITHUB_ID'),
      clientSecret: secret('GITHUB_SECRET'),
      scopes: ['repo'],
    },
  },
  calls: { listIssues: get('/issues', { input: {} }) },
})
