import { seed } from 'tentjs'

export default seed(({ db }) => {
  db.users.add({ email: 'maya@example.com', roles: [] })
  db.users.add({ email: 'omar@example.com', roles: ['staff'] })
  db.staff.add({ name: 'Ada', pay: 5100 })
  db.staff.add({ name: 'Bob', pay: 4200 })
})
