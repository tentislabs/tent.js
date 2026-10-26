import { query, text } from 'tentjs'

// A word of the environment that the code of the function reads from a copy of the whole environment.
export const envCopied = query('envCopied', {
  access: 'signedIn',
  output: text(),
  run: () => ({ ...process.env }).REVIEW12_WORD ?? 'none',
})
