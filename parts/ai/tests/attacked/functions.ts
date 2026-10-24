import {
  action,
  agent,
  change,
  choice,
  flow,
  input,
  json,
  files,
  link,
  list,
  mail,
  model,
  number,
  query,
  role,
  secret,
  table,
  text,
} from 'tentjs'

export const users = table('users', {
  columns: { name: text({ optional: true }), roles: list(text()) },
  access: { read: 'owner' },
})

export const notes = table('notes', {
  columns: { words: text(), by: link('users', { optional: true }) },
  owner: 'by',
  access: { read: 'owner', add: 'signedIn' },
})

export const people = table('people', {
  columns: { name: text(), salary: number({ private: true, optional: true }) },
  access: { read: 'signedIn', add: 'signedIn' },
})

export const friends = table('friends', {
  columns: { email: text() },
  access: { read: 'signedIn', add: 'signedIn', change: 'signedIn' },
})

// A conversation that every member may open, and its rows.
export const chats = table('chats', {
  columns: { title: text({ optional: true }) },
  access: { read: role('member'), add: 'signedIn' },
})

export const messages = table('messages', {
  columns: {
    chat: link('chats'),
    who: choice(['user', 'assistant', 'tool', 'summary']),
    text: text({ lines: 'many', optional: true }),
    data: json({ optional: true }),
    run: text({ optional: true }),
    by: link('users', { optional: true }),
  },
  owner: 'by',
  access: { read: 'owner' },
})

export const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('ANTHROPIC_KEY') })

// A model that holds every run together to its day, and each caller to its share of it.
export const thrifty = model('thrifty', {
  provider: 'anthropic',
  name: 'claude-sonnet-5-5',
  key: secret('ANTHROPIC_KEY'),
  limits: { perDay: { calls: 5 }, perCallerPerDay: { calls: 2 } },
})

const letter = { from: 'shop@example.com', subject: 'A note', text: 'From the shop.' }

export const addNote = change('addNote', {
  access: 'signedIn',
  input: { words: text() },
  set: notes.add({ words: input('words') }),
})

export const addPerson = change('addPerson', {
  access: 'signedIn',
  input: { name: text(), salary: number() },
  set: people.add({ name: input('name'), salary: input('salary') }),
})

export const addFriend = change('addFriend', {
  access: 'signedIn',
  input: { email: text() },
  set: friends.add({ email: input('email') }),
})

export const moveFriend = change('moveFriend', {
  access: 'signedIn',
  input: { friend: text(), email: text() },
  set: friends.change(input('friend'), { email: input('email') }),
})

export const newChat = change('newChat', { access: 'signedIn', input: {}, set: chats.add({ title: 'A chat' }) })

// Keeps a text of the caller's own as a file, and answers its id.
export const keepNote = action('keepNote', {
  access: 'signedIn',
  input: { words: text() },
  output: text(),
  run: async ({ input }) => files.put(input.words, { name: 'note.txt', kind: 'text/plain' }),
})

export const myNotes = query('myNotes', { access: 'signedIn', input: {}, rows: notes.where({}) })

export const readNotes = flow('readNotes', {
  about: 'Reads the notes',
  access: 'signedIn',
  as: 'starter',
  input: {},
  output: json(),
  sends: false,
  run: async ({ step }) => step('read', () => myNotes({})),
})

export const listPeople = query('listPeople', {
  about: 'Lists the people',
  access: 'signedIn',
  input: {},
  rows: people.where({}),
})

export const leaky = action('leaky', {
  about: 'Fails with a secret',
  access: 'signedIn',
  input: {},
  output: text(),
  sends: false,
  run: async () => {
    throw new Error(`The key is ${['sk', 'secret', '123'].join('-')}`)
  },
})

export const askFirst = action('askFirst', {
  about: 'Says the words after a yes',
  access: 'signedIn',
  input: { words: text() },
  output: text(),
  danger: 'ask',
  run: async ({ input }) => `said ${input.words}`,
})

export const loopMail = flow('loopMail', {
  about: 'Mails twice',
  access: 'signedIn',
  as: 'starter',
  input: {},
  output: text(),
  sends: false,
  run: async ({ step }) => {
    for (let pass = 0; pass < 2; pass++) await step('mail', () => mail.send({ ...letter, to: 'a@example.com' }))
    return 'mailed'
  },
})

export const mailFriend = action('mailFriend', {
  about: 'Mails the friend',
  access: 'signedIn',
  input: { friend: text() },
  output: text(),
  sends: false,
  run: async ({ input, db }) => {
    const friend = await db.friends.get(input.friend)
    await mail.send({ ...letter, to: String(friend?.email) })
    return 'mailed'
  },
})

// An action that asks a person first and mails, which a tool calls.
export const notifyAll = action('notifyAll', {
  access: 'signedIn',
  input: {},
  danger: 'ask',
  run: async () => {
    await mail.send({ ...letter, to: 'all@example.com' })
  },
})

export const threeMails = action('threeMails', {
  about: 'Mails three times',
  access: 'signedIn',
  input: {},
  output: text(),
  sends: false,
  run: async () => {
    await notifyAll({})
    await mail.send({ ...letter, to: 'one@example.com' })
    await mail.send({ ...letter, to: 'two@example.com' })
    return 'mailed'
  },
})

// An action that sends and answers nothing, which a tool calls.
export const notifyQuiet = action('notifyQuiet', {
  access: 'signedIn',
  input: {},
  run: async () => {
    await mail.send({ ...letter, to: 'quiet@example.com' })
  },
})

export const quietThree = action('quietThree', {
  about: 'Mails quietly, then twice more',
  access: 'signedIn',
  input: {},
  output: text(),
  sends: false,
  run: async () => {
    await notifyQuiet({})
    await mail.send({ ...letter, to: 'one@example.com' })
    await mail.send({ ...letter, to: 'two@example.com' })
    return 'mailed'
  },
})

export const guard = agent('guard', {
  model: writer,
  instructions: 'You help.',
  tools: [readNotes, listPeople, leaky, askFirst, loopMail, mailFriend, threeMails, quietThree],
  access: 'signedIn',
  memory: { in: messages, thread: 'chat' },
  limits: { steps: 6, toolCalls: 5, perRun: { calls: 100 } },
})

export const steered = agent('steered', {
  model: writer,
  instructions: 'You help.',
  tools: [],
  access: 'signedIn',
  memory: { in: messages, thread: 'chat' },
  together: { then: 'stop' },
  limits: { steps: 6, perRun: { calls: 100 } },
})

export const queued = agent('queued', {
  model: writer,
  instructions: 'You help.',
  tools: [],
  access: 'signedIn',
  memory: { in: messages, thread: 'chat' },
  together: { then: 'wait' },
  limits: { steps: 6, perRun: { calls: 100 } },
})

export const spender = agent('spender', {
  model: thrifty,
  instructions: 'You spend.',
  tools: [listPeople],
  access: 'anyone',
  limits: { steps: 20, perRun: { calls: 2 } },
})
