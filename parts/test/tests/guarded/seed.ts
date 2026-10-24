import { seed } from 'tentjs'

export default seed(({ db }) => {
  db.users.add({ email: 'maya@example.com', roles: [] })
  db.users.add({ email: 'root@example.com', roles: ['admin'] })
})
