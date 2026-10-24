import { seed } from 'tentjs'

export default seed(({ db }) => {
  db.todos.add({ title: 'Apples', box: 'inbox' })
  db.todos.add({ title: 'Cherries', box: 'inbox' })
  db.todos.add({ title: 'Plums', box: 'later' })
})
