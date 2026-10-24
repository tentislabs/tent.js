import { project } from 'tentjs'

// Three browser engines ask from one address within a minute: no test of them is answered by a count.
export const moves = project('moves', { title: 'Moves', limits: { anyonePerMinute: 100000, screensPerMinute: 100000 } })
