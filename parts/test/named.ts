import { beforeEach } from 'node:test'

// The name of the test that runs now, which the evidence of a failed step is kept under.
let running = 'a test'

// Each test of a file that holds the helpers says its name before it begins.
beforeEach((t) => {
  running = t.name
})

/** The name of the test that runs now, as the runner of the tests names it. */
export const testNow = (): string => running
