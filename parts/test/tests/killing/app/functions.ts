import { change, flow, list, number, post, service, table, text } from 'tentjs'

// The address is written anew by the test, with the port of its stand-in server.
export const ledger = service('ledger', {
  url: 'http://127.0.0.1:1',
  onceOnlyHeader: 'Idempotency-Key',
  calls: { book: post('/book', { input: { tag: text() } }) },
})

export const users = table('users', { columns: { roles: list(text()) }, access: { read: 'owner' } })

export const marks = table('marks', { columns: { tag: text() }, access: { read: 'signedIn' } })

export const mark = change('mark', {
  access: 'signedIn',
  input: { tag: text() },
  run: ({ input, db }) => void db.marks.add({ tag: input.tag }),
})

// Five steps, each of which books with the service and marks what it booked.
export const chain = flow('chain', {
  input: { i: number() },
  run: async ({ input, step }) => {
    for (let k = 1; k <= 5; k++) {
      const tag = `${input.i}/${k}`
      await step(`book ${k}`, async () => {
        await ledger.book({ tag })
        await mark({ tag })
      })
    }
    return input.i
  },
})
