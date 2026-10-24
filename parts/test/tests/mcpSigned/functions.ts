import { action, anyone, change, date, file, grants, json, link, list, object, query, sessions, table, text } from 'tentjs'

export const users = table('users', {
  columns: { email: text({ unique: true }), roles: list(text()) },
  access: { read: 'owner' },
})

export const orders = table('orders', {
  columns: { title: text(), placedBy: link('users', { optional: true }), doc: file({ optional: true }) },
  owner: 'placedBy',
  access: { read: 'owner', add: 'signedIn', change: 'owner' },
})

export const openOrders = query('openOrders', {
  about: 'The orders that the caller placed',
  access: 'signedIn',
  offer: ['mcp', 'cli'],
  input: {},
  output: list(object({ title: text() })),
  run: ({ db }) => db.orders.all().map((one) => ({ title: one.title })),
})

export const addOrder = change('addOrder', {
  about: 'Adds an order for the caller',
  access: 'signedIn',
  offer: ['mcp'],
  input: { title: text(), doc: file({ optional: true }) },
  output: object({ id: text() }),
  run: ({ db, user, input }) => ({ id: db.orders.add({ title: input.title, doc: input.doc, placedBy: user?.id }).id }),
})

export const docOf = query('docOf', {
  about: 'The file of the first order of the caller',
  access: 'signedIn',
  offer: ['mcp'],
  input: {},
  output: file({ optional: true }),
  run: ({ db }) => db.orders.all()[0]?.doc,
})

export const listResources = query('listResources', {
  about: 'The resources of the app',
  access: 'signedIn',
  input: { params: json({ optional: true }) },
  output: json(),
  run: () => ({ resources: [] }),
})

export const notOnline = query('notOnline', {
  about: 'A query that the pages call, offered to no outside door',
  access: 'signedIn',
  input: {},
  output: text(),
  run: () => 'for the pages',
})

// The sign-in of the project: the tests sign a person in by their email, as a builder's own sign-in would.
export const signIn = action('signIn', {
  access: anyone('the sign-in of the tests'),
  system: 'finds the user of an email',
  input: { email: text() },
  run: async ({ db, input }) => {
    const user = await db.system.users.where({ email: input.email }).first()
    if (user) sessions.start(user.id)
    return user?.id
  },
})

export const signOut = action('signOut', {
  access: 'signedIn',
  input: {},
  run: async () => {
    sessions.end()
  },
})

export const myGrants = query('myGrants', {
  about: 'The programs that act for the caller',
  access: 'signedIn',
  input: {},
  output: list(object({ id: text(), client: text(), name: text(), scopes: list(text()), for: text(), createdAt: date(), usedAt: date(), reusedAt: date({ optional: true }) })),
  run: () => grants.list(),
})

export const endGrant = change('endGrant', {
  access: 'signedIn',
  input: { id: text() },
  run: ({ input }) => {
    grants.end(input.id)
  },
})

export const grantsOf = query('grantsOf', {
  access: 'signedIn',
  input: { user: text() },
  output: list(object({ id: text(), client: text(), name: text(), scopes: list(text()), for: text(), createdAt: date(), usedAt: date(), reusedAt: date({ optional: true }) })),
  run: ({ input }) => grants.list(input.user),
})

export const everyGrantOf = query('everyGrantOf', {
  access: anyone('the tests read every grant of a user'),
  system: 'reads the grants of any user',
  input: { user: text() },
  output: list(object({ id: text(), client: text(), name: text(), scopes: list(text()), for: text(), createdAt: date(), usedAt: date(), reusedAt: date({ optional: true }) })),
  run: ({ input }) => grants.list(input.user),
})

// What a test asks a client through: the request to a client of MCP that the maker of `engine.ts` was handed and
// keeps in the heap where the code of the app runs, so that the test reaches it in whatever room the code runs.
export const askClient = action('askClient', {
  access: 'nobody',
  system: 'asks a client of MCP as a provider of the builder would',
  input: { grant: text(), method: text(), params: json() },
  output: json(),
  run: async ({ input }) => {
    const request: unknown = Reflect.get(globalThis, 'tentMcpRequest')
    if (typeof request !== 'function') throw new Error('the maker of the project was handed no request to a client')
    return Reflect.apply(request, undefined, [input.grant, input.method, input.params])
  },
})
