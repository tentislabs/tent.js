import { seed } from 'tentjs'

export default seed(({ db }) => {
  db.orders.add({ name: 'Chair', status: 'paid', total: 1250 })
  db.orders.add({ name: 'Lamp', status: 'open', total: 199900 })
})
