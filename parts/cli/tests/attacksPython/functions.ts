import { action, change, choice, file, files, input, json, link, number, object, python, query, role, text } from 'tentjs'
import { customers, notes, orders } from './tables.ts'

export const customerName = query('customerName', {
  access: 'signedIn',
  input: { id: link('customers') },
  rows: customers.get(input('id')),
})

export const addNote = change('addNote', { access: 'signedIn', input: { body: text() }, set: notes.add({ body: input('body') }) })

export const staffOnly = query('staffOnly', { access: role('staff'), rows: notes.where({}) })

export const putNamed = action('putNamed', {
  access: 'signedIn',
  input: { name: text(), text: text() },
  output: text(),
  run: async ({ input: given }) => files.put(given.text, { name: given.name, kind: 'text/plain' }),
})

export const asks = python('asks', {
  file: 'py/asks.py',
  input: { customer: link('customers'), what: choice(['unknown', 'refused']) },
  uses: [customerName, staffOnly],
  output: json(),
  access: 'signedIn',
})

export const environment = python('environment', { file: 'py/environment.py', input: {}, output: json(), access: 'signedIn' })

export const packaged = python('packaged', {
  file: 'py/packaged.py',
  input: {},
  packages: ['tinyone'],
  output: number(),
  access: 'signedIn',
})

export const forges = python('forges', { file: 'py/forges.py', input: {}, output: text(), access: 'signedIn' })

export const hog = python('hog', {
  file: 'py/hog.py',
  input: { mb: number() },
  limits: { memory: '100 MB', time: '20 seconds' },
  output: number(),
  access: 'signedIn',
})

export const spin = python('spin', { file: 'py/spin.py', input: {}, limits: { time: '2 seconds' }, output: number(), access: 'signedIn' })

export const named = python('named', { file: 'py/named.py', input: { f: file() }, output: json(), access: 'signedIn' })

export const rowsOf = python('rowsOf', {
  file: 'py/rows.py',
  input: { customer: link('customers') },
  rows: {
    orders: orders.where({ customer: input('customer') }),
    linked: orders.with('customer'),
  },
  output: json(),
  access: 'signedIn',
})

export const quiet = python('quiet', {
  file: 'py/quiet.py',
  input: {},
  uses: [addNote],
  changes: false,
  output: json(),
  access: 'signedIn',
})

export const writes = python('writes', {
  file: 'py/writes.py',
  input: { where: choice(['inside', 'outside', 'dotdot', 'linked', 'folderLink', 'large']) },
  output: object({ made: file() }),
  access: 'signedIn',
})

export const floods = python('floods', {
  file: 'py/floods.py',
  input: { how: choice(['header', 'answer']) },
  output: text(),
  access: 'signedIn',
})

export const stdin = python('stdin', { file: 'py/stdin.py', input: {}, output: text(), access: 'signedIn' })

export const pid = python('pid', { file: 'py/pid.py', input: {}, output: number(), access: 'signedIn' })

export const later = python('later', { file: 'py/later.py', input: {}, output: text(), access: 'signedIn' })

export const holder = python('holder', {
  file: 'py/holder.py',
  input: {},
  rows: { notes: notes.where({}) },
  limits: { time: '20 seconds' },
  output: json(),
  access: 'signedIn',
})

export const selfie = python('selfie', {
  file: 'py/selfie.py',
  input: {},
  uses: [{ definition: 'selfie' }],
  output: text(),
  access: 'signedIn',
})

export const spawns = python('spawns', {
  file: 'py/spawns.py',
  input: { how: choice(['time', 'memory', 'exit']) },
  limits: { time: '4 seconds', memory: '100 MB' },
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
