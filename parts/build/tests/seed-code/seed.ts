import { seed } from 'tentjs'

export default seed(({ db }) => {
  for (let i = 0; i < 3; i++) db.tasks.add({ title: `Task ${Math.round(i)}` })
})
