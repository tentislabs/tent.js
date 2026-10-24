import {
  agent,
  change,
  choice,
  chunks,
  file,
  files,
  flow,
  input,
  json,
  link,
  list,
  model,
  number,
  object,
  query,
  role,
  secret,
  table,
  text,
  vector,
} from 'tentjs'

// The document chat of the pieces of AI, in plain definitions, with what the example leaves out: the users, and
// the changes that add a document and a chat.

export const users = table('users', {
  columns: { name: text(), roles: list(text()) },
  access: { read: 'signedIn' },
})

export const addUser = change('addUser', {
  access: 'nobody',
  input: { name: text(), roles: list(text()) },
  set: users.add({ name: input('name'), roles: input('roles') }),
})

export const embedder = model('embedder', {
  provider: 'openai',
  name: 'text-embedding-3-small',
  key: secret('OPENAI_KEY'),
  abilities: ['embed'],
})
export const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('ANTHROPIC_KEY') })

export const documents = table('documents', {
  columns: { title: text(), file: file({ kinds: ['application/pdf', 'text/*'] }) },
  access: { read: 'signedIn', add: role('staff') },
})

export const docChunks = table('docChunks', {
  columns: {
    document: link('documents', { onRemove: 'remove' }),
    text: text({ lines: 'many' }),
    page: number({ whole: true, optional: true }),
    meaning: vector({ size: 1536, model: embedder }),
  },
  access: { read: 'signedIn' },
})

export const addPiece = change('addPiece', {
  input: {
    document: link('documents'),
    text: text({ lines: 'many' }),
    page: number({ whole: true, optional: true }),
    meaning: vector({ size: 1536, model: embedder }),
  },
  access: 'nobody',
  set: docChunks.add({ document: input('document'), text: input('text'), page: input('page'), meaning: input('meaning') }),
})

export const readIn = flow('readIn', {
  on: documents.added(),
  limits: { steps: 5000 },
  run: async ({ event, step }) => {
    const content = await step('read', () => files.text(event.row.file))
    const parts = await step('cut', () => chunks(content, { size: 1200, overlap: 150 }))
    for (const piece of parts) {
      const meaning = await step('meaning', () => embedder.embed(piece.text))
      await step('keep', () => addPiece({ document: event.row.id, text: piece.text, page: piece.page, meaning }))
    }
  },
})

export const findInDocuments = flow('findInDocuments', {
  about: 'The parts of the documents that are about the given words',
  input: { words: text() },
  as: 'starter',
  output: list(object({ text: text(), page: number({ optional: true }), document: object({ title: text() }) })),
  run: async ({ input, step, db }) => {
    const meaning = await step('meaning', () => embedder.embed(input.words))
    const found = await step('found', () =>
      db.docChunks.near('meaning', meaning).with('document').limit(8).pick(['text', 'page', 'document']).all(),
    )
    return found
  },
})

export const chats = table('chats', {
  columns: { title: text({ optional: true }), user: link('users') },
  owner: 'user',
  access: { read: 'owner', add: 'signedIn', remove: 'owner' },
})

export const messages = table('messages', {
  columns: {
    chat: link('chats', { onRemove: 'remove' }),
    who: choice(['user', 'assistant', 'tool', 'summary']),
    text: text({ lines: 'many', optional: true }),
    data: json({ optional: true }),
    run: text({ optional: true }),
    user: link('users', { optional: true }),
  },
  owner: 'user',
  access: { read: 'owner' },
})

export const chatMessages = query('chatMessages', {
  input: { chat: link('chats') },
  access: 'signedIn',
  rows: messages.where({ chat: input('chat'), who: { in: ['user', 'assistant'] } }).limit(200),
})

export const helper = agent('helper', {
  about: 'Answers questions from the documents',
  model: writer,
  instructions: 'Answer from the documents, and name the page.',
  tools: [findInDocuments],
  access: 'signedIn',
  limits: { steps: 6, perRun: { tokensOut: 20000 } },
  memory: { in: messages, thread: 'chat' },
})

export const addDocument = change('addDocument', {
  access: role('staff'),
  input: { title: text(), file: file({ kinds: ['application/pdf', 'text/*'] }) },
  set: documents.add({ title: input('title'), file: input('file') }),
})

export const newChat = change('newChat', { access: 'signedIn', input: {}, set: chats.add({ title: 'A chat' }) })

