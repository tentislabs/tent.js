import { declared } from '../test/index.ts'

// The program that `tent test --declared` starts in the folder of the project, as the runner starts a test file:
// the cases made from the declarations, each a test of its own; `TENT_DECLARED=update` keeps the table of access anew.
await declared({ update: process.env.TENT_DECLARED === 'update' })
