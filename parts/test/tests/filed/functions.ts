import {
  action,
  anyone,
  boolean,
  change,
  file,
  files,
  input,
  json,
  link,
  list,
  number,
  object,
  query,
  sessions,
  table,
  text,
} from 'tentjs'

const open = anyone('a test tries the files')

export const users = table('users', {
  columns: { email: text({ unique: true }), roles: list(text()) },
  access: { read: 'owner' },
})

// What a person keeps: a paper, a paper that no rule hands out, several papers, a scan inside a record, and a
// free value that may name a file and holds none. An earlier version of a row is kept.
export const papers = table('papers', {
  columns: {
    title: text(),
    by: link('users'),
    paper: file({ optional: true, kinds: ['text/plain', 'application/pdf', 'image/*'], maxSize: '4 KB' }),
    hidden: file({ optional: true, private: true }),
    more: list(file(), { optional: true }),
    scan: object({ front: file({ optional: true }) }, { optional: true }),
    free: json({ optional: true }),
  },
  owner: 'by',
  keepHistory: true,
  access: { read: 'owner', add: 'signedIn', change: 'owner', remove: 'owner' },
})

// A file that everyone may see is held by a row that everyone may read.
export const notices = table('notices', {
  columns: { title: text(), picture: file({ optional: true }) },
  access: { read: 'anyone', add: 'signedIn', remove: 'signedIn' },
})

export const keepPaper = change('keepPaper', {
  access: 'signedIn',
  input: {
    title: text(),
    paper: file({ optional: true }),
    hidden: file({ optional: true }),
    more: list(file(), { optional: true }),
    front: file({ optional: true }),
    free: json({ optional: true }),
  },
  run: ({ input: given, user, db }) =>
    db.papers.add({
      title: given.title,
      by: user.id,
      ...(given.paper === undefined ? {} : { paper: given.paper }),
      ...(given.hidden === undefined ? {} : { hidden: given.hidden }),
      ...(given.more === undefined ? {} : { more: given.more }),
      ...(given.front === undefined ? {} : { scan: { front: given.front } }),
      ...(given.free === undefined ? {} : { free: given.free }),
    }).id,
  output: text(),
})

export const swapPaper = change('swapPaper', {
  access: 'signedIn',
  input: { row: text(), paper: file({ optional: true }) },
  run: ({ input: given, db }) => {
    db.papers.change(given.row, { paper: given.paper ?? null })
  },
})

export const dropPaper = change('dropPaper', {
  access: 'signedIn',
  input: { row: text() },
  set: papers.remove(input('row')),
})

export const post = change('post', {
  access: 'signedIn',
  input: { title: text(), picture: file() },
  set: notices.add({ title: input('title'), picture: input('picture') }),
})

export const unpost = change('unpost', {
  access: 'signedIn',
  input: { row: text() },
  set: notices.remove(input('row')),
})

// A function with full access is never handed a file that its caller could not have read.
export const filedBySystem = change('filedBySystem', {
  access: 'signedIn',
  system: 'a test stores a file with full access',
  input: { paper: file() },
  run: ({ input: given, user, db }) => db.system.papers.add({ title: 'by the system', by: user.id, paper: given.paper }).id,
  output: text(),
})

// An action that only reads the file it is handed.
export const nameOf = action('nameOf', {
  access: 'signedIn',
  input: { paper: file({ kinds: ['text/plain'], maxSize: '1 KB' }) },
  output: text(),
  run: async ({ input: given }) => (await files.info(given.paper))?.name ?? '',
})

// --- the handle ---

export const putText = action('putText', {
  access: open,
  input: { words: text(), name: text({ default: 'words.txt' }), kind: text({ optional: true }) },
  output: text(),
  run: async ({ input: given }) =>
    files.put(given.words, { name: given.name, ...(given.kind === undefined ? {} : { kind: given.kind }) }),
})

export const putBytes = action('putBytes', {
  access: open,
  input: { base64: text(), name: text(), kind: text({ optional: true }) },
  output: text(),
  run: async ({ input: given }) =>
    files.put(new Uint8Array(Buffer.from(given.base64, 'base64')), {
      name: given.name,
      ...(given.kind === undefined ? {} : { kind: given.kind }),
    }),
})

export const getText = action('getText', {
  access: open,
  input: { id: text(), from: number({ optional: true }), to: number({ optional: true }) },
  output: text(),
  run: async ({ input: given }) => {
    const range = given.from === undefined ? undefined : { from: given.from, ...(given.to === undefined ? {} : { to: given.to }) }
    return Buffer.from(await files.get(given.id, range)).toString('utf8')
  },
})

// Writes a file of so many bytes from a stream, and reads it back as a stream: its size is never the size of the memory.
export const streamed = action('streamed', {
  access: open,
  input: { megabytes: number() },
  output: object({ id: text(), size: number(), read: number(), same: boolean() }),
  run: async ({ input: given }) => {
    const part = new Uint8Array(1024 * 1024).fill(7)
    let left = given.megabytes
    const source = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (left-- > 0) controller.enqueue(part)
        else controller.close()
      },
    })
    const id = await files.put(source, { name: 'large.bin' })
    let read = 0
    let same = true
    for await (const bytes of files.stream(id)) {
      read += bytes.length
      same &&= bytes.every((byte: number) => byte === 7)
    }
    return { id, size: (await files.info(id))?.size ?? 0, read, same }
  },
})

export const infoOf = action('infoOf', {
  access: open,
  input: { id: text() },
  output: json(),
  run: async ({ input: given }) => (await files.info(given.id)) ?? 'none',
})

export const removeFile = action('removeFile', {
  access: open,
  input: { id: text() },
  run: async ({ input: given }) => files.remove(given.id),
})

export const setKind = action('setKind', {
  access: open,
  system: 'a test states the kind of a file itself',
  input: { id: text(), kind: text() },
  run: async ({ input: given }) => files.setKind(given.id, given.kind),
})

export const setKindAsAnyone = action('setKindAsAnyone', {
  access: open,
  input: { id: text(), kind: text() },
  run: async ({ input: given }) => files.setKind(given.id, given.kind),
})

// --- who is calling ---

export const signIn = action('signIn', {
  access: open,
  system: 'finds the user that signs in, whom nobody may read yet',
  input: { email: text() },
  run: async ({ input: given, db }) => {
    const user = await db.system.users.where({ email: given.email }).first()
    if (user) sessions.start(user.id)
  },
})

export const whoAmI = query('whoAmI', { access: open, output: text(), run: ({ user }) => user?.id ?? 'nobody' })
