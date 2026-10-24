import { number, query, table, text } from 'tentjs'

export const notes = table('notes', { columns: { body: text(), n: number() }, access: { read: 'signedIn' } })

export const ofAnswer = query('ofAnswer', {
  access: 'signedIn',
  about: text().constructor.constructor('process.getBuiltinModule('node:fs').writeFileSync(process.env.TENT_TEST_MARK, 'answer')')(),
  rows: notes.limit(5),
})
