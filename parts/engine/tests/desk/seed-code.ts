import { seed } from 'tentjs'
import { addTag, remind } from './functions.ts'

export default seed(async ({ db, call, now }) => {
  const ada = db.users.add({ name: 'Ada', roles: ['staff'], salary: 5000 })
  db.notes.add({ title: `seeded at ${now.toISOString()}`, owner: ada.id })
  db.notes.add({ title: `one of ${db.users.count()}`, owner: ada.id })
  // A call is a call like any other: it runs as the system, and an action answers a promise.
  call(addTag, { name: 'by a call' })
  const notes = await call(remind)
  db.tags.add({ name: `after ${notes} notes` })
})
