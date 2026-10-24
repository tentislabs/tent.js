import { seed } from 'tentjs'

const TITLES = ['Buy milk', 'Write home']

export default seed(({ db, now }) => {
  const first = db.tasks.add({ title: 'Start' })
  for (const title of TITLES) db.tasks.add({ title, after: first.id, at: now })
})
