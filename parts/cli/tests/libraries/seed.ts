import { seed } from 'tentjs'

export default seed(({ db }) => {
  db.sales.add({ month: 'Jan', amount: 40 })
  db.sales.add({ month: 'Feb', amount: 55 })
  db.sales.add({ month: 'Mar', amount: 32 })
  db.sales.add({ month: 'Apr', amount: 71 })
  db.sales.add({ month: 'May', amount: 64 })
  db.sales.add({ month: 'Jun', amount: 88 })
})
