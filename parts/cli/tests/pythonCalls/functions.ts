import {
  action,
  agent,
  boolean,
  change,
  files,
  choice,
  date,
  day,
  file,
  input,
  json,
  link,
  list,
  model,
  number,
  object,
  python,
  query,
  role,
  secret,
  text,
} from 'tentjs'
import { weather } from './services.ts'
import { customers, notes, orders } from './tables.ts'

export const customerName = query('customerName', {
  access: 'signedIn',
  input: { id: link('customers') },
  rows: customers.get(input('id')),
})

export const addNote = change('addNote', { access: 'signedIn', input: { body: text() }, set: notes.add({ body: input('body') }) })

export const addMeta = change('addMeta', {
  access: 'signedIn',
  input: { body: text(), meta: json() },
  set: notes.add({ body: input('body'), meta: input('meta') }),
})

export const staffOnly = query('staffOnly', { access: role('staff'), rows: notes.where({}) })

export const putFile = action('putFile', {
  access: 'signedIn',
  input: { text: text() },
  output: text(),
  run: async ({ input: given }) => files.put(given.text, { name: 'note.txt', kind: 'text/plain' }),
})

export const echo = python('echo', {
  file: 'py/echo.py',
  input: {
    t: text(),
    n: number(),
    b: boolean(),
    d: date(),
    on: day(),
    c: choice(['red', 'blue']),
    l: link('customers'),
    many: list(number()),
    o: object({ x: number() }),
    j: json(),
    f: file(),
  },
  output: json(),
  access: 'signedIn',
})

export const rowsOf = python('rowsOf', {
  file: 'py/rows.py',
  input: { customer: link('customers') },
  rows: {
    orders: orders.where({ customer: input('customer') }),
    linked: orders.with('customer'),
    total: orders.count(),
  },
  output: json(),
  access: 'signedIn',
})

export const notesRows = python('notesRows', {
  file: 'py/rows.py',
  input: {},
  rows: { notes: notes.where({}) },
  output: json(),
  access: 'signedIn',
})

export const rowsAll = python('rowsAll', {
  file: 'py/rows.py',
  input: { customer: link('customers') },
  rows: {
    orders: orders.where({ customer: input('customer') }),
    linked: orders.with('customer'),
    total: orders.count(),
  },
  system: 'the tests read every order',
  output: json(),
  access: 'signedIn',
})

export const environment = python('environment', { file: 'py/environment.py', input: {}, output: json(), access: 'signedIn' })

export const environmentGpu = python('environmentGpu', {
  file: 'py/environment.py', input: {},
  gpu: true,
  output: json(),
  access: 'signedIn',
})

export const numbers = python('numbers', {
  file: 'py/numbers.py', input: {},
  packages: ['numberish'],
  output: object({ one: number(), many: list(number()), at: date() }),
  access: 'signedIn',
})

export const notANumber = python('notANumber', {
  file: 'py/nan.py', input: {},
  output: object({ value: number() }),
  access: 'signedIn',
})

export const writes = python('writes', {
  file: 'py/writes.py',
  input: { where: choice(['inside', 'outside', 'linked', 'large']) },
  output: object({ made: file() }),
  access: 'signedIn',
})

export const fileOf = python('fileOf', {
  file: 'py/fileOf.py',
  input: { id: text() },
  output: text(),
  access: 'signedIn',
})

export const callsBack = python('callsBack', {
  file: 'py/callsBack.py',
  input: { customer: link('customers'), what: choice(['back', 'unknown', 'refused']) },
  uses: [customerName, addNote, staffOnly],
  output: json(),
  access: 'signedIn',
})

export const fails = python('fails', { file: 'py/fails.py', input: {}, output: json(), access: 'signedIn' })

export const crashes = python('crashes', { file: 'py/crashes.py', input: {}, output: json(), access: 'signedIn' })

export const prints = python('prints', { file: 'py/prints.py', input: {}, output: number(), access: 'signedIn' })

export const pid = python('pid', { file: 'py/pid.py', input: {}, output: number(), access: 'signedIn' })

export const slow = python('slow', {
  file: 'py/slow.py',
  input: { seconds: number() },
  limits: { time: '2 seconds' },
  output: number(),
  access: 'signedIn',
})

export const slowLoad = python('slowLoad', {
  file: 'py/slowLoad.py',
  input: {},
  limits: { time: '1 second' },
  output: text(),
  access: 'signedIn',
})

export const hog = python('hog', {
  file: 'py/hog.py',
  input: { mb: number() },
  limits: { memory: '100 MB' },
  output: number(),
  access: 'signedIn',
})

export const large = python('large', { file: 'py/large.py', input: {}, output: number(), access: 'signedIn' })

export const small = python('small', {
  file: 'py/small.py',
  input: {},
  limits: { memory: '50 MB' },
  output: number(),
  access: 'signedIn',
})

export const dies = python('dies', { file: 'py/dies.py', input: {}, output: number(), access: 'signedIn' })

export const inner = python('inner', { file: 'py/inner.py', input: {}, output: text(), access: 'signedIn' })

export const outer = python('outer', { file: 'py/outer.py', input: {}, uses: [inner], output: text(), access: 'signedIn' })

export const stdin = python('stdin', { file: 'py/stdin.py', input: {}, output: text(), access: 'signedIn' })

export const frames = python('frames', { file: 'py/frames.py', input: {}, output: text(), access: 'signedIn' })

export const progressing = python('progressing', {
  file: 'py/progressing.py',
  input: { wait: boolean() },
  output: json(),
  access: 'signedIn',
})

export const asksService = python('asksService', {
  file: 'py/asksService.py',
  input: { city: text() },
  uses: [weather.today],
  output: json(),
  access: 'signedIn',
})

// Pythons that hold the processor: two of one may stand in the program at once, and one is ended at its time.
export const spin = python('spin', {
  file: 'py/spin.py',
  input: { seconds: number() },
  atOnce: 2,
  limits: { time: '10 seconds' },
  output: number(),
  access: 'signedIn',
})

export const spinLong = python('spinLong', {
  file: 'py/spin.py',
  input: { seconds: number() },
  limits: { time: '3 seconds' },
  output: number(),
  access: 'signedIn',
})

// An agent whose tool is a python that states it sends nothing, and calls a function that sends: the test
// stands in for its model.
export const sendOut = action('sendOut', {
  about: 'Sends a note out',
  access: 'signedIn',
  input: {},
  output: text(),
  run: async () => (await fetch('data:text/plain,sent')).text(),
})

export const sendsFromPython = python('sendsFromPython', {
  about: 'Works in Python',
  file: 'py/sendsOut.py',
  input: {},
  uses: [sendOut],
  sends: false,
  output: text(),
  access: 'signedIn',
})

export const pyThinker = model('pyThinker', {
  provider: 'anthropic',
  name: 'claude-test',
  key: secret('PY_MODEL_KEY'),
  abilities: ['reply', 'tools'],
})

export const pyHelper = agent('pyHelper', {
  model: pyThinker,
  instructions: 'You work in Python.',
  tools: [sendsFromPython],
  access: 'signedIn',
  limits: { steps: 4, perRun: { calls: 10 } },
})

// A python that says how far it has come, with `tent.say`.
export const saying = python('saying', { file: 'py/saying.py', input: {}, output: number(), access: 'signedIn' })

export const bigProgress = python('bigProgress', {
  file: 'py/bigProgress.py',
  input: {},
  output: json(),
  access: 'signedIn',
})

export const together = python('together', {
  file: 'py/together.py',
  input: { seconds: number() },
  atOnce: 2,
  output: json(),
  access: 'signedIn',
})

export const inTurn = python('inTurn', {
  file: 'py/together.py',
  input: { seconds: number() },
  output: json(),
  access: 'signedIn',
})

export const later = python('later', { file: 'py/later.py', input: {}, output: text(), access: 'signedIn' })
