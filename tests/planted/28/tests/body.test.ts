import { test } from 'node:test'

test('[99-3] a test that is skipped in its body', (t) => {
  t.skip()
})
