import assert from 'node:assert/strict'
import { test } from 'node:test'

test('[99-1] a plain test that fails', () => {
  assert.fail('planted')
})

test('[99-2] [99-3] a test with two ids', () => {})

test('[99-4] one of two with one id, which passes', () => {})

test('[99-4] the other of the two, which fails', () => {
  assert.fail('planted')
})

test('[99-5] one of two with one id, which passes', () => {})

test('[99-5] the other of the two, which states the mark', { todo: true }, () => {
  assert.fail('not built')
})

test('[99-6] one of two with one id, which passes', () => {})

test('[99-6] the other of the two, which passes too', () => {})

test('[99-7] one of two with one id, which states the mark', { todo: true }, () => {
  assert.fail('not built')
})

test('[99-7] the other of the two, which fails', () => {
  assert.fail('planted')
})

test('[99-8] the first of two with one id, which fails', () => {
  assert.fail('planted')
})

test('[99-8] the second of the two, which passes', () => {})

test('[99-9] the first of two with one id, which states the mark', { todo: true }, () => {
  assert.fail('not built')
})

test('[99-9] the second of the two, which passes', () => {})
