import { boolean, flow } from 'tentjs'
import { bigProgress, progressing, saying } from './functions.ts'

// A step that calls a python which says, and whose starter may follow the run.
export const sayingFlow = flow('sayingFlow', {
  as: 'starter',
  access: 'signedIn',
  follow: 'signedIn',
  input: {},
  run: async ({ step }) => step('say', () => saying({})),
})

export const scoring = flow('scoring', {
  input: { wait: boolean() },
  run: async ({ input, step }) => step('score', () => progressing({ wait: input.wait })),
})

export const smallScoring = flow('smallScoring', {
  input: {},
  limits: { result: '1 KB' },
  run: async ({ step }) => step('score', () => bigProgress({})),
})
