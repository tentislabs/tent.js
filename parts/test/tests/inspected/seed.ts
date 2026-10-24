import { seed } from 'tentjs'

export default seed(({ db }) => {
  for (const [title, rank] of [
    ['North', 10],
    ['East', 20],
    ['South', 30],
    ['West', 40],
  ])
    db.notes.add({ title, rank })
})
