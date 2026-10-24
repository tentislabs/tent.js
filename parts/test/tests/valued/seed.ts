import { seed } from 'tentjs'

export default seed(({ db }) => {
  db.orders.add({ name: 'Ann', total: 12, paid: true })
  db.orders.add({ name: 'Bo', total: 5, paid: false })
  db.orders.add({ name: 'Cem', total: 7.5, paid: true })
})
