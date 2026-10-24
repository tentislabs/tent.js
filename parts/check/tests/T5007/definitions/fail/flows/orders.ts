import { action, change, emit, flow, input, number, start, table, text } from 'tentjs'

export const notes = table('notes', { columns: { body: text() }, access: { read: 'signedIn' } })

export const addNote = change('addNote', {
  access: 'signedIn',
  input: { body: text() },
  set: notes.add({ body: input('body') }),
})

// A step that remembers its answer by nothing.
export const remembers = flow('remembers', {
  run: async ({ step }) => step('slow', () => 1, { worker: 'gpu', remember: { for: '1 day' } }),
})

// An action that says it changes nothing, and calls a change.
export const quiet = action('quiet', {
  access: 'signedIn',
  changes: false,
  input: { body: text() },
  run: async ({ input: given }) => {
    await addNote({ body: given.body })
  },
})

// `follow` on an action that is no run, and machine seconds in a limit of a definition.
export const followed = action('followed', {
  access: 'signedIn',
  follow: 'signedIn',
  limits: { perDay: { machineSeconds: 60 } },
  input: { n: number() },
  run: async ({ input: given }) => given.n,
})

// A batch whose code takes one input and answers one value, in place of a list of each.
export const batchOfOne = action('batchOfOne', {
  access: 'signedIn',
  worker: 'gpu',
  sends: false,
  batch: { max: 4 },
  input: { n: number() },
  run: async ({ input: given }) => given.n,
})

// A reserve of two hours against a limit of one minute a day.
export const reserved = action('reserved', {
  access: 'signedIn',
  worker: 'gpu',
  sends: false,
  limits: { time: '2 hours', perDay: { workSeconds: 60 } },
  input: { n: number() },
  run: async ({ input: given }) => given.n,
})

export const later = flow('later', { run: async () => 1 })

// An action that says it changes nothing, and starts a run and emits an event.
export const quietStarts = action('quietStarts', {
  access: 'signedIn',
  changes: false,
  input: { n: number() },
  run: async () => {
    start(later)
  },
})

export const quietEmits = action('quietEmits', {
  access: 'signedIn',
  changes: false,
  input: { n: number() },
  run: async () => {
    emit('order.paid')
  },
})
