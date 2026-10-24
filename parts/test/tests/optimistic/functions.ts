import { action, boolean, change, input, query, role, table, text } from 'tentjs'

export const todos = table('todos', {
  columns: { title: text(), box: text(), done: boolean({ default: false }) },
  access: { read: 'anyone', add: 'anyone', change: 'anyone', remove: 'anyone' },
})

// Two lists of one table, each by its filter and sorted by the title, and a count of one of them.
export const inbox = query('inbox', { access: 'anyone', rows: todos.where({ box: 'inbox' }).oldest('title') })

export const later = query('later', { access: 'anyone', rows: todos.where({ box: 'later' }).oldest('title') })

export const inboxCount = query('inboxCount', { access: 'anyone', rows: todos.where({ box: 'inbox' }).count() })

export const addTodo = change('addTodo', {
  access: 'anyone',
  input: { title: text(), box: text() },
  set: todos.add({ title: input('title'), box: input('box') }),
})

export const finish = change('finish', {
  access: 'anyone',
  input: { todo: text() },
  set: todos.change(input('todo'), { done: true }),
})

export const drop = change('drop', {
  access: 'anyone',
  input: { todo: text() },
  set: todos.remove(input('todo')),
})

// A change the engine refuses a visitor: what the page showed of it is taken back.
export const staffAdd = change('staffAdd', {
  access: role('staff'),
  input: { title: text() },
  set: todos.add({ title: input('title'), box: 'inbox' }),
})

// An action is never shown ahead, whatever it writes.
export const addLater = action('addLater', {
  access: 'anyone',
  input: { title: text() },
  run: async ({ input: given }) => {
    await addTodo({ title: given.title, box: 'inbox' })
  },
})
