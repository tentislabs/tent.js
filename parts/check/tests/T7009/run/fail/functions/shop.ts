import { action, text } from 'tentjs'
import { addOrder } from './orders'

// Takes what the change answers.
export const orderNow = action('orderNow', {
  access: 'signedIn',
  input: {},
  output: text(),
  run: async () => {
    const made = await addOrder({ total: 1 })
    return String(Object(made).id)
  },
})
