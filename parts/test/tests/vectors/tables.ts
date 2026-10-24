import { model, table, text, vector } from 'tentjs'

export const embedderA = model('embedderA', { provider: 'mine', name: 'a-1', abilities: ['embed'] })
export const embedderB = model('embedderB', { provider: 'mine', name: 'b-1', abilities: ['embed'] })

// The vector of a doc, which the model makes from its body; a test sets the limit of its `by`.
export const docs = table('docs', {
  columns: {
    body: text(),
    vec: vector({ size: 3, model: embedderA, optional: true, by: 'body' }),
  },
  access: { read: 'signedIn', add: 'signedIn', change: 'signedIn', remove: 'signedIn' },
})

// A second column of the same model, which no limit of the first holds.
export const notes = table('notes', {
  columns: {
    body: text(),
    vec: vector({ size: 3, model: embedderA, optional: true, by: 'body' }),
  },
  access: { read: 'signedIn', add: 'signedIn', change: 'signedIn', remove: 'signedIn' },
})
