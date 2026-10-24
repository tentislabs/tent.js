import { project } from 'tentjs'

export const notes = project('notes', {
  title: 'Notes',
  limits: { anyonePerMinute: 100000, screensPerMinute: 100000, liveConnections: 1000 },
})
