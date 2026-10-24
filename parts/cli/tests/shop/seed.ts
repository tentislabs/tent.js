import { seed } from 'tentjs'

export default seed(({ db }) => {
  const ada = db.users.add({ name: 'Ada', roles: ['staff'] })
  const bob = db.users.add({ name: 'Bob', roles: [] })
  db.orders.add({ title: 'A lamp', owner: bob.id })
  db.orders.add({ title: 'A desk', owner: bob.id })
  db.orders.add({ title: 'A chair', owner: ada.id, paid: true })
})
