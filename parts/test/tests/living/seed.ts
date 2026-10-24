import { seed } from 'tentjs'

export default seed(({ db }) => {
  for (const [title, rank] of [
    ['One', 10],
    ['Two', 20],
    ['Three', 30],
    ['Four', 40],
    ['Five', 50],
  ])
    db.cards.add({ title, rank })
})
