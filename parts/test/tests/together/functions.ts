import { change, choice, fail, input, link, list, number, query, table, text } from 'tentjs'

// One row that several people work on at one time.
export const docs = table('docs', {
  columns: { title: text(), body: text() },
  access: { read: 'anyone', add: 'anyone', change: 'anyone' },
})

// Many small edits of one text: each is a row, and the order of their ids is the order of the writes.
export const updates = table('updates', {
  columns: { doc: link('docs'), text: text() },
  access: { read: 'anyone', add: 'anyone' },
})

// Who looks at what, and when they last said so.
export const here = table('here', {
  columns: { doc: link('docs'), who: text(), at: number() },
  access: { read: 'anyone', add: 'anyone' },
})

export const theDoc = query('theDoc', { access: 'anyone', rows: docs.oldest('createdAt').limit(1) })

// A plain change that sets two fields in its one write.
export const setBoth = change('setBoth', {
  access: 'anyone',
  input: { doc: text(), value: text() },
  set: docs.change(input('doc'), { title: input('value'), body: input('value') }),
})

// A change that must not write over another's work: it holds the field it sets against what its page saw, and
// says no in its own code where they differ. Nothing comes between its read and its write.
export const saveField = change('saveField', {
  access: 'anyone',
  input: { doc: text(), field: choice(['title', 'body']), saw: text(), value: text() },
  run: ({ db, input: given }) => {
    const row = db.docs.get(given.doc)
    const held = given.field === 'title' ? row?.title : row?.body
    if (held !== given.saw) fail('changed', 'Someone else changed it while you worked.')
    db.docs.change(given.doc, given.field === 'title' ? { title: given.value } : { body: given.value })
  },
})

export const addUpdate = change('addUpdate', {
  access: 'anyone',
  input: { doc: text(), text: text() },
  set: updates.add({ doc: input('doc'), text: input('text') }),
})

export const updatesOf = query('updatesOf', {
  access: 'anyone',
  input: { doc: text() },
  rows: updates.where({ doc: input('doc') }).sort('id').limit(1000),
})

// A person says that they look at the row: it costs a write each time.
export const look = change('look', {
  access: 'anyone',
  input: { doc: text(), who: text() },
  run: ({ db, input: given, now }) => {
    db.here.add({ doc: given.doc, who: given.who, at: now.getTime() })
  },
})

// Who said so within the last five seconds. It is asked again each second, so that a person who left drops out
// with no write.
export const whoIsHere = query('whoIsHere', {
  access: 'anyone',
  input: { doc: text() },
  output: list(text()),
  refresh: '1 second',
  run: ({ db, input: given, now }) => {
    const since = now.getTime() - 5000
    const names = db.here
      .where({ doc: given.doc })
      .all()
      .filter((row) => row.at > since)
      .map((row) => row.who)
    return [...new Set(names)].sort()
  },
})
