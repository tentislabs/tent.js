import { query, table, text } from 'tentjs'

export const items = table('items', { columns: { body: text() }, access: { read: 'signedIn' } })

export const inInput = query('inInput', {
  access: 'signedIn',
  input: {
    body: text().constructor.constructor("process.getBuiltinModule('node:fs').writeFileSync(process.env.TENT_TEST_MARK, 'input')")(),
  },
  rows: items.limit(5),
})

export const inAccess = query('inAccess', {
  access: text['cons' + 'tructor']("process.getBuiltinModule('node:fs').writeFileSync(process.env.TENT_TEST_MARK, 'access')")(),
  rows: items.limit(5),
})
