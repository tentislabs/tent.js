import { describe, it } from 'node:test'

describe('a group that is skipped', { skip: true }, () => {
  it('[99-4] a test in a group that is skipped', () => {})
})
