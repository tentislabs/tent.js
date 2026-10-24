import { seed } from 'tentjs'

export default seed(({ db }) => {
  db.items.add({ name: 'Saw', kind: 'tool', place: 1 })
  db.items.add({ name: 'Drill', kind: 'tool', place: 2 })
  db.items.add({ name: 'Kite', kind: 'toy', place: 3 })
})
