import { number, object, python, text } from 'tentjs'

export const score = python('score', {
  file: 'score.py',
  packages: ['natone'],
  input: { n: number() },
  output: object({ tag: text(), value: number() }),
  access: 'signedIn',
})

export const oldScore = python('oldScore', {
  file: 'old.py',
  packages: ['tinyone==1.0'],
  lock: 'old',
  input: {},
  output: number(),
  access: 'signedIn',
})
