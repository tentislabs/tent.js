import { list, project, table, text } from 'tentjs'

export const reviewWork = project('reviewWork', {
  zone: 'UTC',
  privateHosts: ['http://127.0.0.1'],
  workers: { gpu: { about: 'A machine with a graphics card', wait: '5 seconds' } },
})

export const users = table('users', {
  columns: { name: text(), roles: list(text()) },
  access: { read: 'signedIn' },
})
