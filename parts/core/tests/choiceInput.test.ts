import assert from 'node:assert/strict'
import { test } from 'node:test'
import { typeCheck } from './typed.ts'

// A choice of an input, of an output and of a column, written with and without options, beside the other type
// words: code is handed one of its values, and nothing wider.
const project = `import { action, change, choice, input, link, list, number, object, query, table, text } from 'tentjs'

export const users = table('users', { columns: { name: text(), roles: list(text()) }, access: { read: 'signedIn' } })

export const things = table('things', {
  columns: { status: choice(['open', 'paid']), kind: choice(['a', 'b'], { default: 'a' }), name: text() },
  access: { read: 'signedIn', add: 'signedIn' },
})

export const asAction = action('asAction', {
  access: 'signedIn',
  input: { status: choice(['open', 'paid']), many: list(choice(['x', 'y'])), inner: object({ s: choice(['u']) }) },
  output: choice(['done', 'not']),
  run: async ({ input }) => {
    const status: 'open' | 'paid' = input.status
    const many: ('x' | 'y')[] = input.many
    const inner: 'u' = input.inner.s
    return status === 'open' && many.length && inner ? 'done' : 'not'
  },
})

export const asQuery = query('asQuery', {
  access: 'signedIn',
  input: { status: choice(['open', 'paid']), limit: number() },
  run: ({ input }) => {
    const status: 'open' | 'paid' = input.status
    return status
  },
})

export const asChange = change('asChange', {
  access: 'signedIn',
  input: { status: choice(['open', 'paid']), kind: choice(['a', 'b'], { optional: true }), id: link('things') },
  run: ({ input, db }) => {
    const kind: 'a' | 'b' | undefined = input.kind
    db.things.add({ status: input.status, name: 'one', ...(kind ? { kind } : {}) })
  },
})

export const asSet = change('asSet', {
  access: 'signedIn',
  input: { status: choice(['open', 'paid']) },
  set: things.add({ status: input('status'), name: 'two' }),
})
`

test('[11-7@9a] a choice of an input, an output and a column is handed to code as its values, written with options or without, in a list and in an object: never as any text', () => {
  const tentDts = `import type * as app from './app.ts'
declare module 'tentjs' {
  interface Tables {
    users: typeof app.users
    things: typeof app.things
  }
}
`
  assert.deepEqual(typeCheck('choice-input', { 'app.ts': project, 'tent.d.ts': tentDts }), [])
})
