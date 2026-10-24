import {
  action,
  anyone,
  attempts,
  boolean,
  change,
  fail,
  input,
  list,
  number,
  passwords,
  query,
  role,
  roles,
  sessions,
  table,
  text,
} from 'tentjs'

const open = anyone('a test tries the pieces of a sign-in')

// A user may read and change their own row: a rule that would let them give themselves a role, were `roles` not guarded.
export const users = table('users', {
  columns: { email: text({ unique: true }), password: text({ optional: true, private: true }), roles: list(text()) },
  access: { read: 'owner', change: 'owner', add: open },
})

// --- passwords ---

// An action writes through a change: the stored text is made first, and the row is added with it.
export const addUser = change('addUser', {
  access: open,
  input: { email: text(), password: text() },
  set: users.add({ email: input('email'), password: input('password') }),
})

export const signUp = action('signUp', {
  access: open,
  input: { email: text(), password: text({ secret: true }) },
  output: text(),
  run: async ({ input: given }) => {
    const row = addUser({ email: given.email, password: await passwords.hash(given.password) })
    return row.id
  },
})

export const signIn = action('signIn', {
  access: open,
  system: 'reads the user that signs in, whom nobody may read yet',
  input: { email: text(), password: text({ secret: true }) },
  output: boolean(),
  run: async ({ input, db }) => {
    const user = await db.system.users.where({ email: input.email }).first()
    if (!user?.password || !(await passwords.check(input.password, user.password))) return false
    sessions.start(user.id)
    return true
  },
})

export const checks = action('checks', {
  access: open,
  input: { password: text(), stored: text() },
  output: boolean(),
  run: async ({ input }) => passwords.check(input.password, input.stored),
})

// `old` answers at once, so a query may ask it.
export const isOld = query('isOld', {
  access: open,
  input: { stored: text() },
  output: boolean(),
  run: ({ input }) => passwords.old(input.stored),
})

// A change waits for nothing: a member that answers a promise has no place in it.
export const hashInWrite = change('hashInWrite', {
  access: open,
  input: { password: text() },
  run: ({ input }) => {
    void passwords.hash(input.password)
  },
})

// --- attempts ---

const limits = { tries: number({ default: 3 }), per: text({ default: '10 minutes' }), address: boolean({ default: false }) }

export const guess = action('guess', {
  access: open,
  input: { email: text(), ...limits },
  run: async ({ input }) => attempts.limit(`signIn:${input.email}`, { tries: input.tries, per: input.per, address: input.address }),
})

// The try is counted though the call fails afterwards: a guess that was wrong still counts.
export const wrongGuess = action('wrongGuess', {
  access: open,
  input: { email: text(), ...limits },
  run: async ({ input }) => {
    attempts.limit(`signIn:${input.email}`, { tries: input.tries, per: input.per, address: input.address })
    return fail('wrong', 'Wrong email or password.')
  },
})

export const forgive = action('forgive', {
  access: open,
  input: { email: text(), address: boolean({ default: false }) },
  run: async ({ input }) => attempts.clear(`signIn:${input.email}`, { address: input.address }),
})

export const guessInWrite = change('guessInWrite', {
  access: open,
  input: { email: text() },
  run: ({ input }) => attempts.limit(`signIn:${input.email}`, { tries: 3, per: '10 minutes' }),
})

// --- roles ---

// What the rule of the table lets a user do with their own row, through a `db` that is limited to them.
export const changeMine = change('changeMine', {
  access: 'signedIn',
  input: { email: text({ optional: true }), roles: list(text(), { optional: true }) },
  run: ({ input, user, db }) => {
    db.users.change(user.id, {
      ...(input.email === undefined ? {} : { email: input.email }),
      ...(input.roles === undefined ? {} : { roles: input.roles }),
    })
  },
})

export const promote = change('promote', {
  access: role('admin'),
  system: 'an admin gives and takes the roles of every user',
  input: { user: text(), role: text() },
  run: ({ input }) => roles.add(input.user, input.role),
})

export const demote = action('demote', {
  access: role('admin'),
  system: 'an admin gives and takes the roles of every user',
  input: { user: text(), role: text() },
  run: async ({ input }) => roles.remove(input.user, input.role),
})

export const giveRoles = change('giveRoles', {
  access: role('admin'),
  system: 'an admin gives and takes the roles of every user',
  input: { user: text(), roles: list(text()) },
  run: ({ input }) => roles.set(input.user, input.roles),
})

// The handle is full access: a function that states no `system` may not use it, whoever calls.
export const promoteMyself = change('promoteMyself', {
  access: 'signedIn',
  input: { role: text() },
  run: ({ input, user }) => roles.add(user.id, input.role),
})

export const staffOnly = query('staffOnly', { access: role('staff'), output: text(), run: () => 'for the staff' })

export const whoAmI = query('whoAmI', {
  access: open,
  output: list(text()),
  run: ({ user }) => (user ? [user.id, ...user.roles] : ['nobody']),
})
