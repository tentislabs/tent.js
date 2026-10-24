import { project } from 'tentjs'

export const shelf = project('shelf', {
  title: 'Shelf',
  // A heavy query of this project counts for some seconds, and three engines ask from one address.
  limits: { queryTime: '60 seconds', anyonePerMinute: 100000, screensPerMinute: 100000 },
})
