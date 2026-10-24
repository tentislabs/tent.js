import { project } from 'tentjs'

export const desk = project('desk', {
  title: 'Desk',
  languages: ['en', 'tr'],
  limits: { anyonePerMinute: 100000, screensPerMinute: 100000 },
})
