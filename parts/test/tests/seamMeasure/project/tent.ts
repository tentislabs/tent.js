import { project } from 'tentjs'

export const seamed = project('seamed', {
  title: 'Seamed',
  limits: { anyonePerMinute: 10000000, screensPerMinute: 10000000 },
})
