import { number, query, table, text } from 'tentjs'

export const notes = table('notes', { columns: { body: text(), n: number() }, access: { read: 'signedIn' } })

export const byConstructor = query('byConstructor', {
  access: 'signedIn',
  about: text.constructor("process.getBuiltinModule('node:fs').writeFileSync(process.env.TENT_TEST_MARK, 'constructor')")(),
  rows: notes.limit(5),
})

export const byProto = query('byProto', {
  access: 'signedIn',
  about: text.__proto__.constructor("process.getBuiltinModule('node:fs').writeFileSync(process.env.TENT_TEST_MARK, 'proto')")(),
  rows: notes.limit(5),
})

export const byAnswer = query('byAnswer', {
  access: 'signedIn',
  about: notes.limit(5).constructor.constructor("process.getBuiltinModule('node:fs').writeFileSync(process.env.TENT_TEST_MARK, 'answer')")(),
  rows: notes.limit(5),
})

export const byCall = query('byCall', {
  access: 'signedIn',
  about: text.call(undefined).kind,
  rows: notes.limit(5),
})

export const byApply = query('byApply', {
  access: 'signedIn',
  about: text.apply(undefined, []).kind,
  rows: notes.limit(5),
})

export const byBind = query('byBind', {
  access: 'signedIn',
  about: text.bind(undefined)().kind,
  rows: notes.limit(5),
})
