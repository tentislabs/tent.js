import { query, text } from 'tentjs'
import { word } from 'review12-word'

// A word of the environment that a package reads for the code of the function.
export const envPackaged = query('envPackaged', {
  access: 'signedIn',
  output: text(),
  run: () => word(),
})
