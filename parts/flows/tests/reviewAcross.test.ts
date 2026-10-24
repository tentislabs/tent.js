import assert from 'node:assert/strict'
import { test } from 'node:test'
import { momentOf } from '../lengths.ts'

const day = 86_400_000

test('[23-7] a wait of one month is 30 days and a wait of one year 365, as a length is wherever it is a wait or a limit', () => {
  const now = Date.UTC(2026, 9, 19)
  assert.equal(momentOf('1 month', now) - now, 30 * day)
  assert.equal(momentOf('2 months', now) - now, 60 * day)
  assert.equal(momentOf('1 year', now) - now, 365 * day)
})
