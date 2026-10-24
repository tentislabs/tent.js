import { seed } from 'tentjs'

export default seed(({ db }) => {
  db.notes.add({ name: 'Ann' })
  db.notes.add({ name: 'Bo' })
})
