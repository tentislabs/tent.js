import { change, day, input, link, query, text } from 'tentjs'
import { tasks } from '../tables/tasks'

export const allTasks = query('allTasks', {
  about: 'Every task, the soonest due first',
  access: 'signedIn',
  rows: tasks.sort('due').limit(200),
})

export const addTask = change('addTask', {
  about: 'Adds a task, with the day it is due',
  access: 'signedIn',
  input: { title: text({ min: 1, max: 500 }), due: day({ optional: true }) },
  set: tasks.add({ title: input('title'), due: input('due') }),
})

export const finishTask = change('finishTask', {
  about: 'Marks a task as done',
  access: 'signedIn',
  input: { task: link('tasks') },
  set: tasks.change(input('task'), { done: true }),
})
