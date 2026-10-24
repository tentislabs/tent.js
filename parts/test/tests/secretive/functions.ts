import { action, anyone, secrets, text } from 'tentjs'

// What a secret holds, told to the test: an answer is the code's own word, and is not searched.
export const valueOf = action('valueOf', {
  access: anyone('a test reads the value that it gave'),
  input: { name: text() },
  output: text(),
  run: async ({ input }) => secrets[input.name].reveal(),
})
