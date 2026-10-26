import { seed } from 'tentjs'

export default seed(({ db }) => {
  db.users.add({ name: 'Ada', roles: [] })
})
