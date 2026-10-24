import {
  action,
  allow,
  anyone,
  attempts,
  boolean,
  change,
  date,
  fail,
  file,
  input,
  json,
  link,
  list,
  log,
  mail,
  number,
  object,
  query,
  role,
  roles,
  route,
  secrets,
  sessions,
  table,
  text,
} from 'tentjs'

const open = anyone('an attack tries it')

const session = list(object({ id: text(), createdAt: date(), usedAt: date(), current: boolean() }))

// A user may read and change their own row: a rule that would let them give themselves a role, were `roles` not guarded.
export const users = table('users', {
  columns: { email: text({ unique: true }), roles: list(text()) },
  access: { read: 'owner', change: 'owner' },
})

// A table with a column that no rule hands out.
export const staff = table('staff', {
  columns: { name: text(), pay: number({ private: true }) },
  access: { read: 'anyone' },
})

export const notes = table('notes', {
  columns: { words: text() },
  access: { read: role('staff'), add: 'anyone' },
})

// --- who is calling ---

export const signIn = action('signIn', {
  access: open,
  system: 'finds the user that signs in, whom nobody may read yet',
  input: { email: text() },
  run: async ({ input: given, db }) => {
    const user = await db.system.users.where({ email: given.email }).first()
    if (!user) return fail('unknown', 'No user has that email.')
    sessions.start(user.id)
  },
})

export const signOut = action('signOut', { access: open, run: async () => sessions.end() })

export const signOutOne = action('signOutOne', {
  access: 'signedIn',
  input: { id: text() },
  run: async ({ input: given }) => sessions.end(given.id),
})

// Neither states `system`: each takes the caller's own user alone.
export const endOther = action('endOther', {
  access: 'signedIn',
  input: { user: text() },
  run: async ({ input: given }) => sessions.endAll(given.user),
})

export const listOther = action('listOther', {
  access: 'signedIn',
  input: { user: text() },
  output: session,
  run: async ({ input: given }) => sessions.list(given.user),
})

export const devices = query('devices', {
  access: 'signedIn',
  output: session,
  run: ({ user }) => sessions.list(user.id),
})

export const whoAmI = query('whoAmI', { access: open, output: text(), run: ({ user }) => user?.id ?? 'nobody' })

// A query reads: a session is started in a change, an action or a route.
export const startInQuery = query('startInQuery', {
  access: open,
  input: { user: text() },
  output: text(),
  run: ({ input: given }) => {
    sessions.start(given.user)
    return 'started'
  },
})

export const staffNotes = query('staffNotes', { access: role('staff'), rows: notes.oldest('words') })

export const addNote = change('addNote', {
  access: open,
  input: { words: text() },
  set: notes.add({ words: input('words') }),
})

export const takeRole = change('takeRole', {
  access: 'nobody',
  system: 'an attack takes a role away while its user watches',
  input: { user: text(), role: text() },
  run: ({ input: given }) => roles.remove(given.user, given.role),
})

// A guess that is counted, and whose call then fails.
export const wrongGuess = action('wrongGuess', {
  access: open,
  input: { email: text(), tries: number(), address: boolean({ default: false }) },
  run: async ({ input: given }) => {
    attempts.limit(`signIn:${given.email}`, { tries: given.tries, per: '10 minutes', address: given.address })
    return fail('wrong', 'Wrong email or password.')
  },
})

export const changeMine = change('changeMine', {
  access: 'signedIn',
  input: { roles: list(text()) },
  run: ({ input: given, user, db }) => {
    db.users.change(user.id, { roles: given.roles })
  },
})

export const renameMine = change('renameMine', {
  access: 'signedIn',
  input: { email: text() },
  run: ({ input: given, user, db }) => {
    db.users.change(user.id, { email: given.email })
  },
})

// --- what an action that a screen reads may not do ---

export const peekSession = action('peekSession', {
  access: open,
  system: 'finds a user to start a session for',
  output: text(),
  run: async ({ db }) => {
    const user = await db.system.users.where({ email: 'omar@example.com' }).first()
    sessions.start(String(user?.id))
    return 'a session was started'
  },
})

export const peekAttempts = action('peekAttempts', {
  access: open,
  output: text(),
  run: async () => {
    attempts.clear('signIn:maya@example.com')
    return 'a count was cleared'
  },
})

export const peekMail = action('peekMail', {
  access: open,
  output: text(),
  run: async () => {
    await mail.send({ to: 'someone@example.com', subject: 'read by a screen', text: 'sent by a read' })
    return 'a mail was sent'
  },
})

// --- routes ---

export const payroll = route('payroll', {
  method: 'GET',
  path: '/staff.json',
  access: 'anyone',
  run: async ({ db }) => Response.json(await db.staff.all()),
})

export const shut = route('shut', {
  method: 'GET',
  path: '/shut',
  access: allow(() => false),
  run: async () => new Response('the rule let the caller in'),
})

export const posted = route('posted', {
  method: 'POST',
  path: '/hooks/own',
  access: open,
  run: async () => new Response('taken'),
})

export const pay = route('pay', {
  method: 'POST',
  path: '/hooks/pay',
  access: open,
  origins: ['https://pay.example'],
  run: async () => new Response('taken'),
})

// What a route that sends every header of its request to an outside address would send.
export const handed = route('handed', {
  method: 'GET',
  path: '/handed',
  access: open,
  run: async ({ request }) => Response.json(Object.fromEntries(request.headers)),
})

// --- secrets and mail ---

export const tells = action('tells', {
  access: open,
  input: { name: text() },
  run: async ({ input: given }) => {
    throw new Error(`the service refused the key ${secrets[given.name].reveal()}`)
  },
})

export const writes = action('writes', {
  access: open,
  input: { name: text() },
  run: async ({ input: given }) => {
    const value = secrets[given.name].reveal()
    log.info(`called the service with ${value}`, { key: value, sent: encodeURIComponent(value) })
    log.warn(`in base64: ${Buffer.from(value).toString('base64')}`)
  },
})

export const send = action('send', {
  access: open,
  input: { message: json() },
  run: async ({ input: given }) => mail.send(Object(given.message)),
})

// --- what is sealed, and what is searched ---

// What is stored encrypted, each value by itself, with its earlier versions kept.
export const vault = table('vault', {
  columns: { title: text(), note: text({ sealed: true }) },
  keepHistory: true,
  access: { read: 'anyone', add: 'anyone', change: 'anyone' },
})

export const keepNote = change('keepNote', {
  access: open,
  input: { title: text(), note: text() },
  output: text(),
  run: ({ input: given, db }) => db.vault.add({ title: given.title, note: given.note }).id,
})

export const renote = change('renote', {
  access: open,
  input: { row: text(), note: text() },
  run: ({ input: given, db }) => {
    db.vault.change(given.row, { note: given.note })
  },
})

export const notesKept = query('notesKept', {
  access: open,
  output: list(text()),
  run: ({ db }) => db.vault.all().map((one) => one.note),
})

// What each user reads of their own alone, and searches by its words.
export const memos = table('memos', {
  columns: { body: text(), by: link('users') },
  owner: 'by',
  search: ['body'],
  access: { read: 'owner', add: 'signedIn' },
})

export const addMemo = change('addMemo', {
  access: 'signedIn',
  input: { body: text() },
  run: ({ input: given, user, db }) => {
    db.memos.add({ body: given.body, by: user.id })
  },
})

export const findMemos = query('findMemos', {
  access: 'signedIn',
  input: { words: text() },
  output: list(text()),
  run: ({ input: given, db }) =>
    db.memos
      .search(given.words)
      .limit(3)
      .all()
      .map((one) => one.body),
})

// --- a file id that travels as a text ---

export const papers = table('papers', {
  columns: { title: text(), paper: file({ optional: true }) },
  access: { read: 'anyone', add: 'signedIn' },
})

// The id reaches the change as a text, so the door holds it to nothing: the write itself must.
export const stash = change('stash', {
  access: 'signedIn',
  input: { id: text() },
  run: ({ input: given, db }) => {
    db.papers.add({ title: 'stashed', paper: given.id })
  },
})

export const stashAsSystem = change('stashAsSystem', {
  access: 'signedIn',
  system: 'an attack stores a file with full access',
  input: { id: text() },
  run: ({ input: given, db }) => {
    db.system.papers.add({ title: 'stashed by the system', paper: given.id })
  },
})
