import { project } from 'tentjs'

export const words = project('words', {
  title: 'Words',
  languages: ['en', 'tr'],
  limits: { anyonePerMinute: 100000, screensPerMinute: 100000, liveConnections: 1000 },
})
