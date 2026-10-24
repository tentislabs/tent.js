import { query, text } from 'tentjs'

export const greeting = query('greeting', {
  access: 'anyone',
  input: { name: text({ default: '' }) },
  output: text(),
  run: ({ input }) => `Hello ${input.name}`,
})
