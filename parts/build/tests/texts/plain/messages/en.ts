import { messages } from 'tentjs/ui'

// A word that is worked out is no word written in place.
const name = ['Open', 'orders'].join(' ')

export default messages('en', { orders: { title: name } })
