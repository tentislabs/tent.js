import { action, boolean, change, date, flow, input, json, mail, text, undo } from 'tentjs'
import { notes, tags } from '../tables/tables'

export const addNote = change('addNote', {
  access: 'signedIn',
  input: { title: text() },
  set: notes.add({ title: input('title') }),
})

export const setNote = change('setNote', {
  access: 'signedIn',
  input: { note: text(), title: text() },
  set: notes.change(input('note'), { title: input('title') }),
})

export const markDone = change('markDone', {
  access: 'signedIn',
  input: { note: text() },
  set: notes.change(input('note'), { done: true }),
})

export const dropNote = change('dropNote', {
  access: 'signedIn',
  input: { note: text() },
  set: notes.remove(input('note')),
})

export const tagNote = change('tagNote', {
  access: 'signedIn',
  input: { note: text(), word: text() },
  set: tags.add({ note: input('note'), word: input('word') }),
})

// A run that tidies the notebook: it adds two notes, renames one, marks one done, removes one, and tells by mail.
export const tidy = flow('tidy', {
  input: { rename: text(), finish: text(), drop: text() },
  run: async ({ input: given, step }) => {
    await step('add', () => {
      addNote({ title: 'Added by the run' })
      addNote({ title: 'Also added by the run' })
    })
    await step('rename', () => setNote({ note: given.rename, title: 'Renamed by the run' }))
    await step('finish', () => markDone({ note: given.finish }))
    await step('drop', () => dropNote({ note: given.drop }))
    await step('tell', () => mail.send({ to: 'ada@example.com', subject: 'Tidied', text: 'The notebook is tidied.' }))
  },
})

// A run that undoes another, so that its own change is a run's, and is undone in its turn.
export const reverse = flow('reverse', {
  input: { run: text() },
  run: async ({ input: given, step }) => step('undo', () => undo.run(given.run)),
})

// Undo of what a run, a grant or a key did: the builder's own action, which decides who may.
export const undoRun = action('undoRun', {
  access: 'nobody',
  system: 'undo writes what the run wrote, whoever wrote it',
  input: { run: text(), dry: boolean({ optional: true }) },
  output: json(),
  run: async ({ input: given }) => undo.run(given.run, { ...(given.dry === undefined ? {} : { dry: given.dry }) }),
})

export const undoGrant = action('undoGrant', {
  access: 'nobody',
  system: 'undo writes what a program wrote with a grant',
  input: { grant: text(), since: date(), dry: boolean({ optional: true }) },
  output: json(),
  run: async ({ input: given }) =>
    undo.grant(given.grant, { since: given.since, ...(given.dry === undefined ? {} : { dry: given.dry }) }),
})
