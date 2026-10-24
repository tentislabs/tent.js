import { project } from 'tentjs'

// Screens of four outside libraries, with no line of `unlock`: what a library writes into the page is let in by
// the nonce of the page alone. Three engines ask from one address: no test of them is answered by a count.
export const libraries = project('libraries', {
  title: 'Libraries',
  html: { 'data-mantine-color-scheme': 'light' },
  limits: { anyonePerMinute: 1000000, callerPerMinute: 1000000, screensPerMinute: 1000000 },
})
