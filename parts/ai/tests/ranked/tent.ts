import { project } from 'tentjs'

export const library = project('library', {
  title: 'Library',
  limits: { anyonePerMinute: 100000, callerPerMinute: 100000 },
})
