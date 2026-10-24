import { seed } from 'tentjs'

export default seed(({ db }) => {
  db.users.add({ email: 'ada@example.com', roles: [] })
  db.tiles.add({ color: '#ff0000', place: 1 })
  db.tiles.add({ color: '#0000ff', place: 2 })
})
