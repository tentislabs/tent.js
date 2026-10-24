import { action, object, text } from 'tentjs'
import { noted } from './helpers/seen.ts'

export const summarize = action('summarize', {
  access: 'nobody',
  system: 'fills the summary of an order from its own columns',
  input: { title: text(), note: text() },
  output: text(),
  run: async ({ input }) => {
    await noted('summarize', input)
    return `${input.title}: ${input.note}`
  },
})

export const cases = action('cases', {
  access: 'nobody',
  system: 'fills the cases of a summary',
  input: { text: text() },
  output: object({ upper: text(), lower: text() }),
  run: async ({ input }) => {
    await noted('cases', input)
    return { upper: input.text.toUpperCase(), lower: input.text.toLowerCase() }
  },
})

export const whoOf = action('whoOf', {
  access: 'nobody',
  system: 'fills the name of the customer of an order',
  input: { name: text() },
  output: text(),
  run: async ({ input }) => {
    await noted('whoOf', input)
    return `for ${input.name}`
  },
})

