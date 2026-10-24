import { seed } from 'tentjs'

export default seed(({ db }) => {
  db.notes.add({ title: 'First note' })
})
