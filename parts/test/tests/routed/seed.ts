import { seed } from 'tentjs'

export default seed(({ db }) => {
  db.users.add({ email: 'maya@example.com', roles: ['staff'] })
  db.users.add({ email: 'omar@example.com', roles: [] })
})
