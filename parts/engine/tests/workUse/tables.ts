import { list, project, table, text } from 'tentjs'

// Each test sets the limits of use of the kind that it holds work to.
export const workUse = project('workUse', {
  zone: 'UTC',
  workers: {
    gpu: { about: 'A machine with a graphics card', wait: '5 seconds' },
    cheap: { about: 'A machine that is counted for the app alone', countBy: 'app' },
  },
})

export const users = table('users', {
  columns: { name: text(), roles: list(text()) },
  access: { read: 'signedIn' },
})
