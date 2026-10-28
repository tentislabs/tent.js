import { killedAt } from '../../../rig/kill.ts'

// A program that ends at once after its line, in every start: the start that its round kills stands still at the
// line all the same, so it is never done before its kill, however quick it is and however slow the run that kills it.
killedAt('go')
console.log('ended')
