import { action, change, input, list, number, text } from 'tentjs'
import { codes, users } from './tables.ts'

export const addUser = change('addUser', {
  access: 'nobody',
  input: { name: text(), roles: list(text()) },
  set: users.add({ name: input('name'), roles: input('roles') }),
})

export const addCode = change('addCode', {
  access: 'signedIn',
  input: { code: text() },
  set: codes.add({ code: input('code') }),
})

// How often the work was carried out, which the answer holds, so a remembered answer is told from a new one.
let made = 0

// An answer that rests on the sealed codes, which every caller who is signed in reads alike.
export const codesSeen = action('codesSeen', {
  access: 'signedIn',
  remember: { shared: 'the codes are the same for everyone who is signed in' },
  input: { n: number() },
  output: text(),
  run: async ({ db }) => {
    made += 1
    const rows = await db.codes.all()
    return `${rows.map((row) => row.code).join(' ')} ${made}`
  },
})
