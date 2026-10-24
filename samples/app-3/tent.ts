import { project } from 'tentjs'

export const desk = project('desk', {
  title: 'Help desk',
  languages: ['en'],
  signInPath: '/sign-in',
  mail: { from: { name: 'Help desk', address: 'help@desk.example' } },
  cli: { name: 'desk' },
})
