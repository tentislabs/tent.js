import { seed } from 'tentjs'

export default seed(({ db }) => {
  db.items.add({ title: 'seeded' })
})
