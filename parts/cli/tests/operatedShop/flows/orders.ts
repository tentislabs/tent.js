import { flow, text, token, concat } from 'tentjs'

// Each of the two steps draws a token, so a test sees which of them a new run carried out and which it read.
export const bigOrder = flow('bigOrder', {
  input: { title: text() },
  run: async ({ input, step }) => {
    const told = await step('tell sales', () => concat(input.title, ' ', token()))
    const said = await step.waitFor('approval')
    const word = 'approved' in said && said.approved ? ' yes ' : ' no '
    return step('send', () => concat(told, word, token()))
  },
})

// Its last step fails while the test holds the shop shut, as a step that calls a service that is down does.
export const flakyOrder = flow('flakyOrder', {
  input: { title: text() },
  run: async ({ input, step }) => {
    const told = await step('tell sales', () => concat(input.title, ' ', token()))
    return step(
      'send',
      () => {
        if (Reflect.get(globalThis, 'operatedShut') === true) throw new Error('The shop is shut.')
        return concat(told, ' sent')
      },
      { tries: 1 },
    )
  },
})
