import { anyone, query, text } from 'tentjs'

// A function whose word is one of the runner's own, which `cli.names` gives another.
export const file = query('file', {
  about: 'Names a file',
  access: anyone('a test reaches it under another word'),
  offer: ['cli'],
  input: {},
  output: text(),
  run: () => 'a file',
})
