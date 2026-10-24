import { project } from 'tentjs'

export const board = project('board', {
  title: 'Board',
  limits: { anyonePerMinute: 100000, screensPerMinute: 100000 },
})
