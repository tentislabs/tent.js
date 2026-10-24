import { action, allow, boolean, change, input, link, number, object, python, query, role, text } from 'tentjs'
import { hooks } from '../services/hooks'
import { notes } from '../tables/notes'

export const countNotes = query('countNotes', { access: 'signedIn', about: 'How many notes', rows: notes.count() })

export const openNotes = query('openNotes', {
  access: allow((user) => user !== undefined),
  rows: notes.where({ body: { contains: 'open' } }).limit(input('limit')),
  about: 'The notes that are open',
  input: { limit: number({ default: 50 }) },
  live: false,
  refresh: '1 minute',
  heavy: true,
  offer: ['api', 'mcp', 'cli'],
  deprecated: '2027-01-01',
  system: 'reads every note',
  countBy: 'caller',
  plain: true,
  was: 'notesOpen',
})

export const noteLimit = query('noteLimit', {
  access: 'signedIn',
  input: { limit: number() },
  output: number(),
  reads: [notes],
  run: ({ input }) => input.limit,
})

export const addNote = change('addNote', {
  access: 'signedIn',
  set: notes.add({ team: input('team'), body: input('body') }),
  about: 'Adds a note',
  input: { team: link('teams'), body: text() },
  danger: 'ask',
  offer: ['api'],
  deprecated: '2027-01-01',
  system: 'writes for every team',
  countBy: 'limits',
  everywhere: true,
  plain: true,
  was: 'noteAdd',
})

export const noteBody = change('noteBody', {
  access: 'signedIn',
  input: { body: text() },
  output: text(),
  touches: [notes],
  run: ({ input }) => input.body,
})

export const sendNote = action('sendNote', {
  access: role('staff'),
  run: async ({ input }) => ({ ok: input.note.length > 0 }),
  about: 'Sends a note',
  input: { note: text() },
  output: object({ ok: boolean() }),
  danger: 'ask',
  sends: false,
  offer: ['mcp'],
  deprecated: '2027-01-01',
  system: 'sends for every team',
  background: true,
  worker: 'gpu',
  batch: { max: 600, wait: '1 second', measure: 'note', split: false },
  remember: { for: '30 days', kind: false, version: 'v2', shared: 'the same for everyone' },
  rows: { notes: notes.where({ body: input('note') }) },
  uses: [countNotes, hooks.status],
  changes: false,
  callerGone: 'stop',
  follow: 'signedIn',
  countBy: 'caller',
  limits: { time: '30 seconds', try: '10 seconds', reserve: '5 seconds', lost: 3, perDay: { workSeconds: 3600 }, atLimit: 'wait', runKept: '1 hour' },
  plain: true,
  was: 'noteSend',
})

export const churn = python('churn', {
  file: 'ml/churn.py',
  input: { team: link('teams') },
  output: object({ risk: number() }),
  access: role('staff'),
  packages: ['pandas>=3'],
  files: ['ml/*.joblib'],
  lock: 'old',
  rows: { notes: notes.where({ team: input('team') }) },
  uses: [hooks.status],
  limits: { time: '30 seconds', memory: '1 GB', load: '2 minutes' },
  gpu: true,
  atOnce: 2,
  worker: 'gpu',
  background: 'here',
  batch: { max: 32 },
  remember: true,
  sends: false,
  changes: false,
  callerGone: 'goOn',
  follow: role('staff'),
  countBy: 'limits',
  about: 'How likely a team is to leave',
  danger: 'ask',
  offer: ['api'],
  deprecated: '2027-01-01',
  system: 'reads every team',
  was: 'churnScore',
})
