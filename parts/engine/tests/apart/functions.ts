import { action, boolean, change, fail, flow, mail, number, object, query, text, TentError } from 'tentjs'
import { letters, notes } from './tables.ts'

// Each module of the project leaves a mark on the `globalThis` of the heap that loads it.
Reflect.set(globalThis, 'apartLoaded', [...(Reflect.get(globalThis, 'apartLoaded') ?? []), import.meta.url])

export const oneRead = query('oneRead', {
  access: 'anyone',
  output: number(),
  run: ({ db }) => db.notes.count(),
})

// A query that reads three times and calls another query from code: each answers at once.
export const threeReads = query('threeReads', {
  access: 'anyone',
  output: number(),
  run: ({ db }) => {
    const all = db.notes.all().length
    const first = db.notes.first() ? 1 : 0
    const counted = db.notes.count()
    return all + first + counted + oneRead()
  },
})

export const oneWrite = change('oneWrite', {
  access: 'anyone',
  input: { what: text() },
  output: text(),
  run: ({ db, input }) => db.notes.add({ what: input.what }).id,
})

// A change that writes twice and calls a change from code: one write, undone whole where it fails.
export const twoWrites = change('twoWrites', {
  access: 'anyone',
  input: { what: text(), fails: boolean() },
  output: number(),
  run: ({ db, input }) => {
    db.notes.add({ what: `${input.what} 1` })
    db.notes.add({ what: `${input.what} 2` })
    oneWrite({ what: `${input.what} 3` })
    if (input.fails) fail('no-more', 'The change fails after its writes.')
    return 3
  },
})

export const clockInQuery = query('clockInQuery', {
  access: 'anyone',
  input: { how: text() },
  output: number(),
  run: ({ input }) => (input.how === 'now' ? Date.now() : Math.random()),
})

export const clockInAction = action('clockInAction', {
  access: 'anyone',
  output: number(),
  run: async () => Date.now() + Math.random(),
})

export const addLetter = change('addLetter', {
  access: 'anyone',
  input: { to: text(), body: text() },
  output: text(),
  run: ({ db, input }) => db.letters.add(input).id,
})

// The rule of a table that is code holds in a plan and in code alike.
export const letterPlan = query('letterPlan', { access: 'anyone', rows: letters.oldest('createdAt') })

export const letterCode = query('letterCode', {
  access: 'anyone',
  output: number(),
  run: ({ db }) => db.letters.count(),
})

export const loops = query('loops', {
  access: 'anyone',
  output: number(),
  run: () => {
    for (;;) {
      // Never ends, on purpose.
    }
  },
})

export const loopsAction = action('loopsAction', {
  access: 'anyone',
  output: number(),
  run: async () => {
    for (;;) {
      // Never ends, on purpose.
    }
  },
})

export const fills = action('fills', {
  access: 'anyone',
  output: number(),
  run: async () => {
    const held: number[][] = []
    for (;;) {
      held.push(new Array(1_000_000).fill(held.length))
      await null
    }
  },
})

export const whoAmI = query('whoAmI', {
  access: 'anyone',
  output: text(),
  run: ({ user }) => user?.id ?? 'nobody',
})

// An action that waits, and is called by two callers side by side: each is made as its own caller.
export const asCaller = action('asCaller', {
  access: 'anyone',
  input: { wait: number() },
  output: text(),
  run: async ({ input }) => {
    await new Promise((done) => setTimeout(done, input.wait))
    const me = whoAmI()
    await mail.send({ to: 'room@example.com', from: 'app@example.com', subject: me, text: `written as ${me}` })
    return me
  },
})

export const fetchedBytes = action('fetchedBytes', {
  access: 'anyone',
  input: { url: text() },
  output: object({ bytes: number(), pieces: number() }),
  run: async ({ input }) => {
    const answer = await fetch(input.url)
    let bytes = 0
    let pieces = 0
    const reader = answer.body?.getReader()
    for (let read = await reader?.read(); read && !read.done; read = await reader?.read()) {
      bytes += read.value.length
      pieces += 1
    }
    return { bytes, pieces }
  },
})

export const refuses = change('refuses', {
  access: 'anyone',
  output: text(),
  run: () => fail('not-today', 'No note is taken today.', { fields: { what: 'taken' } }),
})

// A failure of ours that crossed is caught as a `TentError` by the app's own code.
export const catches = action('catches', {
  access: 'anyone',
  output: text(),
  run: async () => {
    try {
      refuses()
      return 'no error'
    } catch (error) {
      if (!(error instanceof TentError)) return 'no TentError'
      return `${error.code} ${JSON.stringify(error.fields)}`
    }
  },
})

// A mark the engine steers a call by, met in a change the code calls: what the code's own heap rebuilt of it.
export const seesMark = action('seesMark', {
  access: 'anyone',
  output: text(),
  run: async () => {
    try {
      refuses()
      return 'no error'
    } catch (error) {
      if (!(error instanceof Error)) return 'no error of the heap'
      return JSON.stringify({
        kind: error instanceof TentError ? 'TentError' : error.name,
        code: error instanceof TentError ? error.code : null,
        place: Reflect.get(error, 'place') ?? null,
        file: Reflect.get(error, 'file') ?? null,
      })
    }
  },
})

export const throwsText = action('throwsText', {
  access: 'anyone',
  output: text(),
  run: async () => {
    throw 'plain words'
  },
})

export const throwsError = action('throwsError', {
  access: 'anyone',
  output: text(),
  run: async () => {
    throw new RangeError('out of the range')
  },
})

// A callable kept past its call.
let kept: ((value: unknown) => void) | undefined

export const keepSay = action('keepSay', {
  access: 'anyone',
  output: text(),
  run: async ({ say }) => {
    kept = say
    return 'kept'
  },
})

export const laterSay = action('laterSay', {
  access: 'anyone',
  output: text(),
  run: async () => {
    kept?.('too late')
    return 'said'
  },
})

// A run that waits an hour, and then leaves its mark: what is due of an app that sleeps.
export const napping = flow('napping', {
  run: async ({ step }) => {
    await step.wait('1 hour')
    await step('mark', () => oneWrite({ what: 'woke' }))
  },
})

export const noteOf = action('noteOf', {
  access: 'anyone',
  input: { what: text() },
  output: text(),
  run: async ({ db, input }) => {
    const found = await db.notes.where({ what: input.what }).first()
    return found?.what ?? 'none'
  },
})
