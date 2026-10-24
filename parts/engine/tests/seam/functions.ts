import { change, object, query, text } from 'tentjs'
import { notes } from './tables.ts'

// What a query answers, kept at the top of the module: the engine must be handed this very record.
const kept = { what: 'kept at the top of the module' }

export const keep = change('keep', {
  access: 'anyone',
  input: { what: text() },
  output: text(),
  run: (handed) => {
    Reflect.set(globalThis, 'seamHanded', handed)
    return handed.db.notes.add({ what: handed.input.what }).what
  },
})

export const keptRecord = query('keptRecord', {
  output: object({ what: text() }),
  access: 'anyone',
  run: () => {
    Reflect.set(globalThis, 'seamAnswer', kept)
    return kept
  },
})
