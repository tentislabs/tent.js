import { boolean, day, table, text } from 'tentjs'

export const tasks = table('tasks', {
  columns: {
    title: text({ min: 1, max: 500 }),
    due: day({ optional: true }),
    done: boolean({ default: false }),
  },
  access: { read: 'signedIn', add: 'signedIn', change: 'signedIn', remove: 'signedIn' },
})
