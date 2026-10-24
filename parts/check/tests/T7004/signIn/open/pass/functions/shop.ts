import { anyone, query, text } from 'tentjs'

export const openingHours = query('openingHours', {
  about: 'When the shop is open',
  access: anyone('the hours are public'),
  offer: ['mcp'],
  input: {},
  output: text(),
  run: () => 'nine to five',
})
