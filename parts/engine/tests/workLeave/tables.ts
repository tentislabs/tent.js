import { list, project, table, text } from 'tentjs'

export const workLeave = project('workLeave', {
  zone: 'UTC',
  privateHosts: ['http://127.0.0.1'],
  // The writer makes the fetches of the work on gpu.
  workers: { gpu: { about: 'A machine with a graphics card', wait: '5 seconds', outside: { fetch: 'writer' } } },
})

export const users = table('users', {
  columns: { name: text(), roles: list(text()) },
  access: { read: 'signedIn' },
})
