import { flow, list, text } from 'tentjs'

export const followUp = flow('followUp', {
  input: { title: text(), lines: list(text()) },
  run: async ({ input, step }) => {
    const greeting = 'Hello'
    await step('tell sales', () => `${greeting} ${input.title}`)
    for (const line of input.lines) {
      await step('note line', () => line)
    }
    await step('thank', () => 'thanks')
    return 'done'
  },
  onFail: async ({ step }) => {
    await step('tell owner', () => 'it failed')
  },
})
