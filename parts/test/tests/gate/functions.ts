import { action, anyone, change, input, list, query, role, table, text } from 'tentjs'

const open = anyone('an attack reads and writes it')

export const users = table('users', {
  columns: { name: text(), roles: list(text()) },
  access: { read: 'signedIn' },
})

// A note holds the texts of an attacker: what is shown, and where a link goes.
export const notes = table('notes', {
  columns: {
    title: text(),
    to: text({ optional: true }),
    hidden: text({ optional: true, private: true }),
  },
  access: { read: open, add: open },
})

export const allNotes = query('allNotes', { access: open, rows: notes.oldest('createdAt') })

export const staffNotes = query('staffNotes', { access: role('staff'), rows: notes.oldest('createdAt') })

export const whoAmI = query('whoAmI', {
  access: open,
  output: text(),
  run: ({ user }) => user?.id ?? 'no user',
})

export const forStaff = query('forStaff', { access: role('staff'), output: text(), run: () => 'for the staff' })

export const addNote = change('addNote', {
  access: open,
  input: { title: text() },
  set: notes.add({ title: input('title') }),
})

// Actions that write, each by a way of its own: read as an entry of `data`, none of them may.

export const writesByChange = action('writesByChange', {
  access: open,
  run: async () => {
    await addNote({ title: 'written by a change' })
  },
})

export const writesThroughAction = action('writesThroughAction', {
  access: open,
  run: async () => {
    await writesByChange()
  },
})

export const writesAsSystem = action('writesAsSystem', {
  access: open,
  system: 'an attack writes with every right',
  run: async ({ call }) => {
    await call(addNote, { title: 'written as the system' })
  },
})

// The change is called once the action has answered: the page is sent, and the write comes after it.
export const writesLater = action('writesLater', {
  access: open,
  output: text(),
  run: async () => {
    setTimeout(() => {
      Promise.resolve()
        .then(() => addNote({ title: 'written later' }))
        .catch(() => undefined)
    }, 5)
    return 'answered'
  },
})

export const writesBySql = action('writesBySql', {
  access: open,
  system: 'an attack writes with a statement of its own',
  run: async ({ db }) => {
    await db.sql('INSERT INTO "notes" ("title") VALUES (?)', ['written by a statement'])
  },
})

export const posts = action('posts', {
  access: open,
  input: { to: text() },
  output: text(),
  run: async ({ input: given }) => {
    const answer = await fetch(given.to, { method: 'POST', body: 'posted by a read' })
    return String(answer.status)
  },
})

// An action whose failure holds a text that no caller may be sent on live data.
export const leaks = action('leaks', {
  access: open,
  run: async () => {
    throw new Error('the key of the service is SECRET-OF-THE-ACTION-0123456789')
  },
})
