import { action, file, files, json, list, number, object, python, text } from 'tentjs'

export const putFile = action('putFile', {
  access: 'signedIn',
  input: { text: text() },
  output: text(),
  run: async ({ input: given }) => files.put(given.text, { name: 'note.txt', kind: 'text/plain' }),
})

export const readFile = action('readFile', {
  access: 'signedIn',
  input: { id: text() },
  output: text(),
  run: async ({ input: given }) => files.text(given.id),
})

export const onCard = python('onCard', {
  file: 'py/onCard.py',
  worker: 'gpu',
  input: { f: file() },
  output: object({ pid: number(), made: file(), text: text(), disk: text() }),
  limits: { time: '20 seconds', try: '4 seconds' },
  access: 'signedIn',
})

export const onSpread = python('onSpread', {
  file: 'py/onSpread.py',
  worker: 'spread',
  input: {},
  output: number(),
  access: 'signedIn',
})

export const fourAtOnce = python('fourAtOnce', {
  file: 'py/fourAtOnce.py',
  worker: 'gpu',
  atOnce: 4,
  input: { seconds: number() },
  output: json(),
  access: 'signedIn',
})

export const batched = python('batched', {
  file: 'py/batched.py',
  worker: 'gpu',
  batch: { max: 4, wait: '1 second' },
  input: { n: number() },
  output: json(),
  access: 'signedIn',
})

export const asksOther = python('asksOther', {
  file: 'py/asksOther.py',
  worker: 'gpu',
  input: {},
  output: text(),
  access: 'signedIn',
})

export const handsBack = python('handsBack', {
  file: 'py/handsBack.py',
  worker: 'gpu',
  input: {},
  output: list(number()),
  access: 'signedIn',
})
