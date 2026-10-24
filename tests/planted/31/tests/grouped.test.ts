import { describe, it, test } from 'node:test'

test('[99-5] a test that holds a group', () => {
  describe('a group inside a test', () => {
    it('[99-6] a test in a group inside a test', () => {})
  })
})
