import { read, screen } from 'tentjs/ui'
import { peekAttempts, peekMail, peekSession } from './functions'

// Each screen reads an action that does what a read may not.
export const sessionScreen = screen('sessionScreen', {
  path: '/session',
  access: 'anyone',
  data: { told: read(peekSession) },
  view: ({ told }) => <h1>{told}</h1>,
})

export const attemptsScreen = screen('attemptsScreen', {
  path: '/attempts',
  access: 'anyone',
  data: { told: read(peekAttempts) },
  view: ({ told }) => <h1>{told}</h1>,
})

export const mailScreen = screen('mailScreen', {
  path: '/mail',
  access: 'anyone',
  data: { told: read(peekMail) },
  view: ({ told }) => <h1>{told}</h1>,
})
