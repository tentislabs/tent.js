import { anyone, query, text } from 'tentjs'

export const hello = query('hello', {
  access: anyone('a test asks the app'),
  output: text(),
  run: () => 'hello',
})
