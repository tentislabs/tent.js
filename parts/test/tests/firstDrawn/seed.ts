import { seed } from 'tentjs'

export default seed(({ db }) => {
  db.orders.add({ name: 'Ann', total: 12 })
  db.orders.add({ name: 'Bo', total: 5 })
})
