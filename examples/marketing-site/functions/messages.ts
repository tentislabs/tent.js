import { anyone, change, input, text } from 'tentjs'
import { messages } from '../tables/messages'

export const sendMessage = change('sendMessage', {
  about: 'Keeps what a visitor wrote in the contact form',
  access: anyone('a visitor writes to the shop through the contact form'),
  input: {
    email: text({ min: 3, max: 254, pattern: '^[^@\\s]+@[^@\\s]+$' }),
    text: text({ lines: 'many', min: 1, max: 5000 }),
  },
  set: messages.add({ email: input('email'), text: input('text') }),
})
