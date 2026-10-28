import { query, text } from 'tentjs'

// A function that no test calls.
export const forgotten = query('forgotten', {
  access: 'signedIn',
  output: text(),
  run: () => 'never asked',
})
