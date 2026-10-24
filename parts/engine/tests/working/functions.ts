import { action, caller, change, files, flow, input, list, log, number, query, text } from 'tentjs'
import { marks, notes, users } from './tables.ts'

export const addUser = change('addUser', {
  access: 'nobody',
  input: { name: text(), roles: list(text()) },
  set: users.add({ name: input('name'), roles: input('roles') }),
})

export const addMark = change('addMark', {
  access: 'signedIn',
  input: { what: text() },
  set: marks.add({ what: input('what') }),
})

export const allMarks = query('allMarks', { access: 'nobody', rows: marks.oldest('createdAt') })

// A step on a worker of gpu.
export const onGpu = flow('onGpu', {
  input: { n: number() },
  run: async ({ input: given, step }) => step('square', () => given.n * given.n, { worker: 'gpu', time: '1 minute' }),
})

// A step on a kind that is handed only what the writer can hold it to: it runs as its starter, and says what it uses.
export const onLocked = flow('onLocked', {
  as: 'starter',
  access: 'signedIn',
  input: { what: text() },
  run: async ({ input: given, step }) =>
    step('mark', () => addMark({ what: given.what }), { worker: 'locked', uses: [addMark] }),
})

// Actions on a worker whose caller may leave: one whose work is stopped then, and one whose work goes on.
export const encodeStops = action('encodeStops', {
  access: 'anyone',
  worker: 'gpu',
  callerGone: 'stop',
  sends: false,
  limits: { time: '1 minute' },
  input: { n: number() },
  run: async ({ input: given }) => given.n,
})

export const encodeGoesOn = action('encodeGoesOn', {
  access: 'anyone',
  worker: 'gpu',
  sends: false,
  limits: { time: '1 minute' },
  input: { n: number() },
  run: async ({ input: given }) => given.n,
})

// On a kind that is handed only what the writer can hold it to: a step that runs as the system, and one that says nothing of what it uses.
export const onLockedSystem = flow('onLockedSystem', {
  run: async ({ step }) => step('mark', () => addMark({ what: 'as the system' }), { worker: 'locked', uses: [addMark] }),
})

export const onLockedNoUses = flow('onLockedNoUses', {
  as: 'starter',
  access: 'signedIn',
  run: async ({ step }) => step('mark', () => addMark({ what: 'unsaid' }), { worker: 'locked' }),
})

// A step that is handed a long text: past `taskSize` it runs here where it states `background` alone, and fails where it states a kind.
export const longHere = flow('longHere', {
  input: { text: text() },
  run: async ({ input: given, step }) => step('count', () => given.text.length, { background: true }),
})

export const longOnGpu = flow('longOnGpu', {
  input: { text: text() },
  run: async ({ input: given, step }) => step('count', () => given.text.length, { worker: 'gpu' }),
})

// A step on a worker that is handed the rows of a plan, read as the caller of its run, and answers how many.
export const withRows = flow('withRows', {
  run: async ({ step }) =>
    step('count', ({ rows }) => (Array.isArray(rows.marks) ? rows.marks.length : -1), {
      worker: 'gpu',
      rows: { marks: marks.oldest('createdAt') },
    }),
})

// A loose file of its caller, which no other caller may download.
export const keepNote = action('keepNote', {
  access: 'signedIn',
  input: { text: text() },
  output: text(),
  run: async ({ input: given }) => files.put(given.text, { name: 'note.txt' }),
})

export const addNote = change('addNote', {
  access: 'signedIn',
  input: { title: text() },
  set: notes.add({ title: input('title'), owner: caller('id') }),
})

// A batch on a worker whose entries are each handed the notes of their own caller.
export const notesOf = action('notesOf', {
  access: 'signedIn',
  worker: 'gpu',
  sends: false,
  batch: { max: 10 },
  limits: { time: '1 minute' },
  input: { n: number() },
  output: number(),
  rows: { notes: notes.limit(100) },
  run: async ({ entries }) => entries.map((entry) => (Array.isArray(entry.rows.notes) ? entry.rows.notes.length : -1)),
})

// A step on the kind that is handed only what the writer can hold it to, in a run that a visitor starts.
export const onLockedVisitor = flow('onLockedVisitor', {
  as: 'starter',
  access: 'anyone',
  input: { what: text() },
  run: async ({ input: given, step }) =>
    step('mark', () => addMark({ what: given.what }), { worker: 'locked', uses: [addMark] }),
})

// A step on a worker whose run its starter runs, for the files that the caller of a task may download.
export const asStarterOnGpu = flow('asStarterOnGpu', {
  as: 'starter',
  access: 'signedIn',
  run: async ({ step }) => step('wait', () => 1, { worker: 'gpu' }),
})

// A step on a worker whose work writes a line of the log.
export const logsOnGpu = flow('logsOnGpu', {
  run: async ({ step }) =>
    step(
      'say',
      () => {
        log.info('a line from the worker', { n: 1 })
        return 1
      },
      { worker: 'gpu' },
    ),
})

// An action on a worker whose `run` a test hands as a stored body, which reads no table and calls nothing.
export const bodyOnGpu = action('bodyOnGpu', {
  access: 'signedIn',
  worker: 'gpu',
  sends: false,
  limits: { time: '1 minute' },
  run: async () => 1,
})
