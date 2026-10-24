import {
  action,
  anyone,
  boolean,
  change,
  choice,
  date,
  day,
  fail,
  file,
  flow,
  json,
  link,
  list,
  number,
  object,
  query,
  role,
  table,
  text,
} from 'tentjs'

export const users = table('users', {
  columns: { name: text(), roles: list(text()) },
  access: { read: 'signedIn' },
})

export const notes = table('notes', {
  columns: { title: text(), by: text({ optional: true }) },
  access: { read: 'anyone', add: 'anyone' },
})

export const addUser = change('addUser', {
  access: 'nobody',
  input: { name: text(), roles: list(text()) },
  run: ({ input, db }) => db.users.add({ name: input.name, roles: input.roles }),
})

// Answers what it was handed, so that a test sees how each flag reached its field.
export const takeOrder = action('takeOrder', {
  about: 'Takes an order, and answers what it was handed',
  access: anyone('a test reads what each flag became'),
  offer: ['cli'],
  input: {
    customer: link('users', { optional: true }),
    total: number({ optional: true }),
    note: text({ optional: true, label: 'Note', help: 'What the desk should know' }),
    placedAt: date({ optional: true }),
    on: day({ optional: true }),
    size: choice(['small', 'large'], { optional: true }),
    done: boolean({ optional: true }),
    tags: list(text(), { optional: true }),
    extra: json({ optional: true }),
    address: object({ city: text() }, { optional: true }),
    doc: file({ optional: true }),
  },
  output: json(),
  run: async ({ input }) => ({ ...input, ...(input.placedAt ? { placedAt: input.placedAt.toISOString() } : {}) }),
})

export const openNotes = query('openNotes', {
  about: 'The notes, the newest last',
  access: anyone('a test reads the notes'),
  offer: ['cli'],
  input: { limit: number({ default: 20 }) },
  output: list(text()),
  run: ({ input, db }) =>
    db.notes
      .all()
      .map((one) => one.title)
      .slice(0, input.limit),
})

export const whoAmI = query('whoAmI', {
  about: 'Who calls',
  access: anyone('it tells a caller only who they are'),
  offer: ['cli', 'api'],
  input: {},
  output: text(),
  run: ({ user }) => user?.id ?? 'no user',
})

export const addNote = change('addNote', {
  about: 'Adds a note as the caller',
  access: anyone('a test adds notes'),
  offer: ['cli'],
  input: { title: text() },
  run: ({ input, db, user }) => db.notes.add({ title: input.title, by: user?.id ?? 'nobody' }),
})

export const failing = action('failing', {
  about: 'Fails, always',
  access: anyone('a test sees a failure'),
  offer: ['cli'],
  input: {},
  run: async () => fail('closed', 'The shop is closed.'),
})

// A function that asks a person before it runs.
export const wipeNotes = action('wipeNotes', {
  about: 'Removes every note',
  access: anyone('a test is asked'),
  offer: ['cli'],
  danger: 'ask',
  input: { reason: text(), code: text({ secret: true, optional: true }) },
  output: text(),
  run: async ({ input }) => `wiped for ${input.reason}`,
})

// For the staff alone: the system passes every rule.
export const staffNote = query('staffNote', {
  about: 'A note for the staff',
  access: role('staff'),
  offer: ['cli'],
  input: {},
  output: text(),
  run: () => 'for the staff',
})

// Answers what a terminal must not be driven by: a control character inside a text.
export const ringing = query('ringing', {
  about: 'Answers a text that holds a control character',
  access: anyone('a test reads what is printed'),
  offer: ['cli', 'api'],
  input: {},
  output: text(),
  run: () => `ring${String.fromCharCode(7)}bell${String.fromCharCode(27)}[2J`,
})

// A flow that is offered: its command answers the flow's answer.
export const weekly = flow('weekly', {
  about: 'Sums the week',
  access: anyone('a test starts it'),
  offer: ['cli'],
  as: 'starter',
  input: { week: number() },
  output: json(),
  run: async ({ input, step }) => step('sum', () => ({ week: input.week, sum: input.week * 2 })),
})

// A flow with `access` and no `offer`: it is no command, and the API does not find it.
export const unlisted = flow('unlisted', {
  access: anyone('a page starts it'),
  as: 'starter',
  input: { week: number() },
  output: json(),
  run: async ({ input, step }) => step('sum', () => ({ week: input.week })),
})
