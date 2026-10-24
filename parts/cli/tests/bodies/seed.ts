import { seed } from 'tentjs'

export default seed(({ db, now }) => {
  const core = db.teams.add({ name: 'Core' })
  db.items.add({ title: 'seeded', n: 1, team: core.id, at: now })
})
