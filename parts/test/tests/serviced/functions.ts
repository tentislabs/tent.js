import { action, anyone, change, files, file, flow, json, list, number, query, table, text } from 'tentjs'
import { counted, remote, signed } from './services'

const open = anyone('a test calls a service')

export const users = table('users', {
  columns: { name: text({ optional: true }), roles: list(text()) },
  access: { read: 'owner' },
})

export const look = action('look', { access: open, input: {}, run: async () => remote.look({}) })

export const pay = action('pay', { access: open, input: { n: number() }, run: async ({ input }) => remote.pay(input) })

export const chart = action('chart', { access: 'signedIn', input: {}, output: text(), run: async () => remote.chart({}) })

export const keep = action('keep', {
  access: 'signedIn',
  input: { words: text() },
  output: text(),
  run: async ({ input }) => files.put(input.words, { name: 'words.txt' }),
})

export const fileOf = action('fileOf', {
  access: 'signedIn',
  input: { id: text() },
  output: json(),
  run: async ({ input }) => {
    const info = await files.info(input.id)
    if (!info) return { none: true }
    return { kind: info.kind, name: info.name, size: info.size }
  },
})

// The id travels as text, so the door holds nothing of it: the service call holds the rule of a download.
export const sendById = action('sendById', {
  access: 'signedIn',
  input: { id: text() },
  run: async ({ input }) => remote.send({ doc: input.id }),
})

export const sendFile = action('sendFile', {
  access: 'signedIn',
  input: { doc: file() },
  run: async ({ input }) => remote.send({ doc: input.doc }),
})

// What code reads of a failure of a service: its code and what the service answered.
export const failure = action('failure', {
  access: open,
  input: {},
  output: json(),
  run: async () => {
    try {
      await remote.look({})
      return { ok: true }
    } catch (error) {
      return { code: Object(error).code, service: Object(error).service }
    }
  },
})

// A plain `fetch` of an address that the test hands it: what it answered, or the code it was refused with.
export const fetched = action('fetched', {
  access: open,
  input: { address: text() },
  output: json(),
  run: async ({ input }) => {
    try {
      const answer = await fetch(input.address)
      return { status: answer.status, size: (await answer.arrayBuffer()).byteLength }
    } catch (error) {
      return { code: Object(error).code }
    }
  },
})

export const inQuery = query('inQuery', { access: open, input: {}, run: () => void remote.look({}) })

export const countedLook = action('countedLook', { access: open, input: {}, run: async () => counted.look({}) })

export const countedPay = action('countedPay', { access: open, input: {}, run: async () => counted.pay({}) })

export const inChange = change('inChange', { access: open, input: {}, run: () => void remote.look({}) })

// An action that a screen may read: it calls nothing that changes something on the other side.
export const readLook = action('readLook', {
  access: open,
  input: {},
  output: json(),
  changes: false,
  run: async () => remote.look({}),
})

export const readPay = action('readPay', {
  access: open,
  input: {},
  changes: false,
  run: async () => remote.pay({ n: 1 }),
})

export const paying = flow('paying', {
  input: { n: number() },
  run: async ({ input, step }) => step('pay', () => remote.pay({ n: input.n })),
})

export const signing = flow('signing', {
  input: { n: number() },
  run: async ({ input, step }) => step('pay', () => signed.pay({ n: input.n })),
})

export const shaping = flow('shaping', {
  input: {},
  run: async ({ step }) => step('shaped', () => remote.shaped({})),
})

// A flow that waits a day, offered to the pages, whose caller waits for its answer.
export const waiting = flow('waiting', {
  input: {},
  access: open,
  as: 'starter',
  run: async ({ step }) => {
    await step.wait('1 day')
    return 'waited'
  },
})
