import { number, object, python } from 'tentjs'

export const mean = python('mean', {
  file: 'mean.py',
  packages: ['numpy'],
  input: { values: number() },
  output: object({ mean: number() }),
  access: 'signedIn',
})

export const crash = python('crash', { file: 'crash.py', input: {}, output: number(), access: 'signedIn' })
