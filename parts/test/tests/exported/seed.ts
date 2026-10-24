import { seed } from 'tentjs'

// Two notes whose addresses differ only in capitals, one whose value holds a slash, and one with a sign that
// cannot stand in the name of a file on every system.
export default seed(({ db }) => {
  db.notes.add({ slug: 'first', body: 'The first note' })
  db.notes.add({ slug: 'second', body: 'The second note' })
  db.notes.add({ slug: 'Second', body: 'The second note in capitals' })
  db.notes.add({ slug: 'a/b', body: 'A note with a slash' })
  db.notes.add({ slug: 'why?', body: 'A note with a question' })
})
