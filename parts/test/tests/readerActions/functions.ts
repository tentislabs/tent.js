import { action, change, input, table, text } from 'tentjs'

// Each opening of the app loads its own copy of this module: what the copy answers says which machine carried a call out.
const machine = `copy ${Math.random()}`

export const marks = table('marks', { columns: { what: text() }, access: { read: 'signedIn', add: 'signedIn' } })

export const addMark = change('addMark', {
  access: 'signedIn',
  input: { what: text() },
  set: marks.add({ what: input('what') }),
})

export const writersOwn = action('writersOwn', {
  access: 'signedIn',
  output: text(),
  run: async () => machine,
})

export const quiet = action('quiet', {
  access: 'signedIn',
  changes: false,
  output: text(),
  run: async () => machine,
})

export const quietWrites = action('quietWrites', {
  access: 'signedIn',
  changes: false,
  output: text(),
  run: async () => {
    await addMark({ what: 'from an action that changes nothing' })
    return machine
  },
})

export const quietOnThread = action('quietOnThread', {
  access: 'signedIn',
  changes: false,
  background: true,
  sends: false,
  output: text(),
  run: async () => machine,
})
