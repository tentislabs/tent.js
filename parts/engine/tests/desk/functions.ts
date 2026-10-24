import {
  action,
  allow,
  anyone,
  boolean,
  change,
  date,
  fail,
  input,
  json,
  link,
  list,
  log,
  number,
  object,
  query,
  random,
  role,
  settings,
  TentError,
  text,
  vector,
} from 'tentjs'
import { isMainThread } from 'node:worker_threads'
import { docs, notes, tags, users, uses, words } from './tables.ts'

// Written with values.

export const notesBy = query('notesBy', {
  access: 'signedIn',
  input: { done: boolean() },
  rows: notes.where({ done: input('done') }).oldest('createdAt'),
})

export const addNote = change('addNote', {
  access: 'signedIn',
  input: { title: text({ min: 1 }) },
  set: notes.add({ title: input('title') }),
})

export const addUser = change('addUser', {
  access: 'nobody',
  input: { name: text(), roles: list(text()), salary: number({ optional: true }) },
  set: users.add({ name: input('name'), roles: input('roles'), salary: input('salary') }),
})

export const addPair = change('addPair', {
  access: 'nobody',
  input: { person: text(), tag: text() },
  set: [users.add({ name: input('person'), roles: [], salary: 7 }), tags.add({ name: input('tag') })],
})

export const publicTags = query('publicTags', {
  access: anyone('the tags are shown to every visitor'),
  rows: tags.sort('name'),
})

export const staffTags = query('staffTags', { access: role('staff'), rows: tags.sort('name') })

export const addTag = change('addTag', {
  access: role('staff'),
  input: { name: text() },
  set: tags.add({ name: input('name') }),
})

export const closed = query('closed', { access: 'nobody', rows: tags.count() })

export const myNote = query('myNote', {
  access: allow((user, given, db) => db.notes.get(given.note) !== undefined),
  input: { note: text() },
  rows: notes.get(input('note')),
})

export const addDoc = change('addDoc', {
  access: 'nobody',
  input: { title: text(), meaning: vector({ size: 3 }) },
  set: docs.add({ title: input('title'), meaning: input('meaning') }),
})

export const nearest = query('nearest', {
  access: anyone('the documents are public'),
  input: { to: vector({ size: 3 }) },
  rows: docs.near('meaning', input('to')).limit(1),
})

// Written with `run`.

export const countNotes = query('countNotes', {
  access: 'signedIn',
  output: number(),
  run: ({ db }) => db.notes.count(),
})

export const whoAmI = query('whoAmI', {
  access: anyone('it tells a caller only who they are'),
  output: text(),
  run: ({ user }) => user?.id ?? 'no user',
})

export const outerWho = query('outerWho', {
  access: 'signedIn',
  output: text(),
  run: () => whoAmI(),
})

export const callsClosed = query('callsClosed', {
  access: anyone('it shows that a rule holds when a function is called from code'),
  run: () => closed(),
})

export const asSystem = query('asSystem', {
  access: anyone('it shows the count of the tags to every visitor'),
  system: 'the count of the tags is behind a function that is open to nobody',
  output: number(),
  run: ({ call }) => call(closed),
})

export const systemSays = query('systemSays', {
  access: 'signedIn',
  system: 'it shows who a function is called as through call',
  output: text(),
  run: ({ call }) => call(whoAmI),
})

export const everyNote = query('everyNote', {
  access: 'signedIn',
  system: 'the office counts the notes of everyone',
  output: number(),
  run: ({ db }) => db.system.notes.count(),
})

export const noSystem = query('noSystem', {
  access: 'signedIn',
  output: number(),
  run: ({ db }) => db.system.notes.count(),
})

export const rawNotes = query('rawNotes', {
  access: 'signedIn',
  system: 'the office counts the notes by a statement of its own',
  output: number(),
  run: ({ db }) => db.sql('SELECT count(*) AS "n" FROM "notes"')[0].n,
})

export const rawNoSystem = query('rawNoSystem', {
  access: 'signedIn',
  output: number(),
  run: ({ db }) => db.sql('SELECT 1 AS "n"')[0].n,
})

export const deep = query('deep', {
  access: 'signedIn',
  input: { n: number() },
  output: number(),
  run: ({ input: given }) => (given.n > 0 ? deep({ n: given.n - 1 }) + 1 : 0),
})

export const byClock = query('byClock', {
  access: 'signedIn',
  input: { how: text() },
  output: number(),
  run: ({ input: given }) => {
    if (given.how === 'now') return Date.now()
    if (given.how === 'new') return new Date().getTime()
    if (given.how === 'text') return Date().length
    return new Date(5).getTime() + Date.UTC(1970, 0, 1)
  },
})

export const byDice = query('byDice', {
  access: 'signedIn',
  input: { how: text() },
  output: number(),
  run: ({ input: given }) => {
    if (given.how === 'word') return random()
    if (given.how === 'bytes') return crypto.getRandomValues(new Uint8Array(1))[0]
    if (given.how === 'id') return crypto.randomUUID().length
    return Math.random()
  },
})

export const byNet = query('byNet', {
  access: 'signedIn',
  output: number(),
  run: () => {
    fetch('http://127.0.0.1:9/')
    return 1
  },
})

export const writesFromQuery = query('writesFromQuery', {
  access: role('staff'),
  run: () => {
    addTag({ name: 'written from a query' })
  },
})

export const remind = action('remind', {
  access: 'signedIn',
  output: number(),
  run: async ({ db }) => await db.notes.count(),
})

export const waitsInChange = change('waitsInChange', {
  access: 'signedIn',
  run: () => {
    remind()
  },
})

export const addTwo = action('addTwo', {
  access: 'signedIn',
  input: { title: text() },
  output: number(),
  run: async ({ input: given, db }) => {
    addNote({ title: `${given.title} 1` })
    await addNote({ title: `${given.title} 2` })
    return await db.notes.count()
  },
})

export const people = query('people', {
  access: role('staff'),
  system: 'the office lists everyone by name',
  output: list(object({ name: text() })),
  run: ({ db }) => db.system.users.sort('name').all(),
})

export const salaries = query('salaries', {
  access: role('staff'),
  system: 'the office reads every user',
  run: ({ db }) => db.system.users.sort('name').all(),
})

export const badOutput = query('badOutput', {
  access: 'signedIn',
  output: number(),
  run: () => 'seven',
})

export const handedNotes = query('handedNotes', {
  access: 'signedIn',
  run: ({ db }) => db.notes.oldest('createdAt').all(),
})

export const copiedNotes = query('copiedNotes', {
  access: 'signedIn',
  run: ({ db }) => db.notes.all().map((row) => ({ ...row })),
})

export const noted = change('noted', {
  access: 'signedIn',
  input: { title: text() },
  run: ({ input: given }) => {
    log.info('a note was seen', { title: given.title })
    log.warn('it was seen twice')
    log.error('it was seen three times')
  },
})

export const shop = query('shop', {
  access: anyone('the name of the shop stands on every page'),
  output: text(),
  run: () => settings.shopName,
})

export const moment = query('moment', {
  access: anyone('the time is no secret'),
  output: date(),
  run: ({ now }) => now,
})

export const fails = change('fails', {
  access: 'signedIn',
  input: { title: text() },
  run: ({ db, input: given }) => {
    db.notes.add({ title: given.title })
    fail('not-today', 'No note is taken today.', { fields: { title: 'taken' } })
  },
})

export const breaks = query('breaks', {
  access: 'signedIn',
  run: () => {
    throw new RangeError('the code of the app broke')
  },
})

export const bodied = query('bodied', {
  access: 'signedIn',
  input: { n: number() },
  output: number(),
  run: ({ input: given, db }) => db.notes.count() + given.n + countNotes(),
})

export const spins = query('spins', {
  access: 'signedIn',
  output: number(),
  run: () => {
    for (const _ of Array.from({ length: 1_000_000 })) continue
    return 1
  },
})

export const turnDocs = change('turnDocs', {
  access: 'nobody',
  system: 'it sets the vector of a document by a statement of its own',
  touches: [docs],
  input: { title: text(), to: vector({ size: 3 }) },
  run: ({ db, input: given }) => {
    db.sql('UPDATE "docs__meaning" SET "v" = ? WHERE "_n" = (SELECT "_n" FROM "docs" WHERE "title" = ?)', [
      new Uint8Array(new Float32Array(given.to).buffer),
      given.title,
    ])
  },
})

// Open to anyone, for a caller of the web, who is nobody until sessions are built.

export const echo = query('echo', {
  access: anyone('it answers a visitor what they sent'),
  input: { text: text(), n: number({ optional: true }), deep: json({ optional: true }) },
  output: json(),
  run: ({ input: given }) => {
    log.info('echo ran')
    return given
  },
})

export const logIn = query('logIn', {
  access: anyone('a visitor signs in with it'),
  input: { name: text(), password: text({ secret: true, min: 8 }) },
  output: text(),
  run: ({ input: given }) => given.name,
})

export const tagOpenly = change('tagOpenly', {
  access: anyone('it shows that the rule of a table holds behind an open function'),
  input: { name: text() },
  set: tags.add({ name: input('name') }),
})

export const addWord = change('addWord', {
  access: anyone('a visitor may add a word'),
  input: { text: text() },
  set: words.add({ text: input('text') }),
})

export const renameWord = change('renameWord', {
  access: anyone('a visitor may mend a word'),
  input: { word: text(), text: text() },
  set: words.change(input('word'), { text: input('text') }),
})

export const dropWord = change('dropWord', {
  access: anyone('a visitor may take a word away'),
  input: { word: text() },
  set: words.remove(input('word')),
})

export const useWord = change('useWord', {
  access: anyone('a visitor may note a use'),
  input: { word: link('words') },
  set: uses.add({ word: input('word') }),
})

export const openRaw = query('openRaw', {
  access: anyone('it shows what a caller is sent of an error that is not theirs to see'),
  output: number(),
  run: ({ db }) => db.sql('SELECT 1 AS "n"')[0].n,
})

export const openBreak = query('openBreak', {
  access: anyone('it shows what a caller is sent of an error of the code of the app'),
  run: () => {
    throw new RangeError('the key of the vault is hunter2')
  },
})

export const openFail = change('openFail', {
  access: anyone('it shows what a caller is sent of an own fail'),
  input: { title: text() },
  run: ({ input: given }) => {
    fail('not-today', `No note named ${given.title} is taken today.`, { fields: { title: 'taken' } })
  },
})

export const openSpin = query('openSpin', {
  access: anyone('it shows what a caller is sent of work that passed its time'),
  output: number(),
  run: () => 1,
})

export const byPay = query('byPay', {
  access: 'signedIn',
  rows: users.sort('name'),
})

export const openPeople = query('openPeople', {
  access: anyone('it shows that a private column does not leave through a stated output'),
  system: 'the page lists every name',
  output: list(object({ name: text() })),
  run: ({ db }) => db.system.users.sort('name').all(),
})

export const openUsers = query('openUsers', {
  access: anyone('it shows that a private column does not leave through a row that has no type'),
  system: 'the page lists every user',
  run: ({ db }) => db.system.users.sort('name').all(),
})

export const wordList = query('wordList', {
  access: anyone('the words are shown to every visitor'),
  output: list(text()),
  run: ({ db }) =>
    db.words
      .sort('text')
      .all()
      .map((word) => word.text),
})

// Marked `heavy`: carried out on a query thread where they are asked through the door or from an action.

export const heavyNotes = query('heavyNotes', {
  access: 'signedIn',
  heavy: true,
  run: ({ db }) => db.notes.oldest('createdAt').all(),
})

export const heavyCopies = query('heavyCopies', {
  access: 'signedIn',
  heavy: true,
  run: ({ db }) => db.notes.all().map((row) => ({ ...row })),
})

export const heavyUsers = query('heavyUsers', {
  access: anyone('it shows that a private column does not cross from a query thread'),
  system: 'the page lists every user',
  heavy: true,
  run: ({ db }) => db.system.users.sort('name').all(),
})

export const onThread = query('onThread', {
  access: anyone('it says where it was carried out'),
  heavy: true,
  output: boolean(),
  run: () => {
    log.info('asked where it runs')
    return !isMainThread
  },
})

export const heavyFails = query('heavyFails', {
  access: anyone('it shows what crosses of a failure from a query thread'),
  heavy: true,
  run: () => {
    const failed = new TentError('T0002', 'The shelf holds no such thing.', {
      fix: 'Name a thing that the shelf holds.',
      where: { file: 'functions.ts', line: 7, definition: 'heavyFails' },
      fields: { thing: 'missing' },
    })
    failed.cause = new TentError('T0013', 'What the failure rests on.', { where: { file: 'tables.ts', line: 3 } })
    throw failed
  },
})

export const callsFails = query('callsFails', {
  access: anyone('it has the same failure thrown where its caller runs'),
  run: () => heavyFails(),
})

export const callsHeavy = query('callsHeavy', {
  access: anyone('it shows that a query which a query calls runs where its caller runs'),
  output: boolean(),
  run: () => onThread(),
})

export const actsHeavy = action('actsHeavy', {
  access: anyone('it shows that a heavy query which an action calls is carried out on a thread'),
  output: boolean(),
  run: async () => await onThread(),
})

export const heavySpin = query('heavySpin', {
  access: anyone('it shows that a heavy read is stopped at its time'),
  heavy: true,
  output: number(),
  run: () => {
    for (;;) continue
  },
})

export const slowRead = query('slowRead', {
  access: anyone('it shows that an ordinary query past its time fails at its next read'),
  output: number(),
  run: ({ db }) => {
    for (;;) db.tags.count()
  },
})

export const heavyWalk = query('heavyWalk', {
  access: anyone('it shows that a heavy query whose run was read needs no module'),
  heavy: true,
  output: number(),
  run: ({ db }) => db.tags.count(),
})
