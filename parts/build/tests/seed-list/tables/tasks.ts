import { boolean, table, text } from 'tentjs'

export const tasks = table('tasks', {
  columns: { title: text(), done: boolean({ default: false }) },
  access: { read: 'signedIn' },
})
