import { project } from 'tentjs'

export const journal = project('journal', {
  title: 'Journal',
  limits: { anyonePerMinute: 100000, callerPerMinute: 100000 },
})
