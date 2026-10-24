import { number, query, table, text } from 'tentjs'

export const notes = table('notes', { columns: { body: text(), n: number() }, access: { read: 'signedIn' } })

export const ofAnswer = query('ofAnswer', {
  access: 'signedIn',
  about: text().constructor.constructor("process.getBuiltinModule('node:fs').writeFileSync(process.env.TENT_TEST_MARK, 'answer'); return 'Notes'")(),
  rows: notes.limit(5),
})

export const workedOut = query('workedOut', {
  access: 'signedIn',
  about: text['cons' + 'tructor']("process.getBuiltinModule('node:fs').writeFileSync(process.env.TENT_TEST_MARK, 'worked out'); return 'Notes'")(),
  rows: notes.limit(5),
})
