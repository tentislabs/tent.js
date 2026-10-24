import { describe, it, test } from 'node:test'

test('[99-1] a light test', () => {})

test('[99-2] a heavy test [night]', () => {})

describe('a group', () => {
  it('[99-3] a light test in a group', () => {})

  it('[99-4] a heavy test in a group [night]', () => {})
})
