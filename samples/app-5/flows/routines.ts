import { every, flow } from 'tentjs'
import { startDueRoutines } from '../functions/routines'

export const dueRoutines = flow('dueRoutines', {
  about: 'Starts each routine whose next moment has come, and moves that moment on',
  on: every('1 minute'),
  run: async ({ step }) => {
    await step('start', () => startDueRoutines())
  },
})
