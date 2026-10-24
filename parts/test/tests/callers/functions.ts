import { action, anyone, boolean, change, date, fail, list, object, query, sessions, table, text } from 'tentjs'

const open = anyone('a test signs in and looks who it is')

export const users = table('users', {
  columns: { email: text({ unique: true }), roles: list(text()) },
  access: { read: 'owner' },
})

// A sign-in as a builder writes one: whoever names the email of a user is that user.
export const signIn = action('signIn', {
  access: open,
  system: 'finds the user that signs in, whom nobody may read yet',
  input: { email: text(), for: text({ optional: true }), browserOnly: boolean({ optional: true }) },
  run: async ({ input, db }) => {
    const user = await db.system.users.where({ email: input.email }).first()
    if (!user) return fail('unknown', 'No user has that email.')
    sessions.start(user.id, {
      ...(input.for === undefined ? {} : { for: input.for }),
      ...(input.browserOnly === undefined ? {} : { browserOnly: input.browserOnly }),
    })
  },
})

// The same inside one write, which `undo` undoes after the session was started.
export const signInWrite = change('signInWrite', {
  access: open,
  system: 'finds the user that signs in, whom nobody may read yet',
  input: { email: text(), undo: boolean({ default: false }) },
  run: ({ input, db }) => {
    const user = db.system.users.where({ email: input.email }).first()
    if (!user) return fail('unknown', 'No user has that email.')
    sessions.start(user.id)
    if (input.undo) fail('undone', 'The write is undone after the session was started.')
  },
})

export const signOut = action('signOut', { access: open, run: async () => sessions.end() })

export const signOutOne = action('signOutOne', {
  access: 'signedIn',
  input: { id: text() },
  run: async ({ input }) => sessions.end(input.id),
})

export const signOutEverywhere = action('signOutEverywhere', {
  access: 'signedIn',
  run: async ({ user }) => sessions.endAll(user.id),
})

// Another user's sessions are ended only by code with full access: this one has none.
export const signOutOther = action('signOutOther', {
  access: 'signedIn',
  input: { user: text() },
  run: async ({ input }) => sessions.endAll(input.user),
})

export const devices = query('devices', {
  access: 'signedIn',
  output: list(object({ id: text(), createdAt: date(), usedAt: date(), current: boolean() })),
  run: ({ user }) => sessions.list(user.id),
})

export const whoAmI = query('whoAmI', {
  access: open,
  output: text(),
  run: ({ user }) => user?.id ?? 'nobody',
})
