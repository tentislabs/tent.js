import { query, text } from 'tentjs'

// A word of the environment that the code of the function reads.
export const envWord = query('envWord', {
  access: 'signedIn',
  output: text(),
  run: () => process.env.REVIEW12_WORD ?? 'none',
})
