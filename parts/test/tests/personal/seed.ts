import { seed } from 'tentjs'

export default seed(({ db }) => {
  db.notes.add({ title: 'First note' })
  db.users.add({ email: 'ada@example.com', roles: [] })
  db.users.add({ email: 'bo@example.com', roles: [] })
})
