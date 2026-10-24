import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fingerprintOf } from '../../core/internal.ts'
import { printsAt } from '../files.ts'

const engine = join(import.meta.dirname, '..')

test("[21-17] the reader of versions keeps a file by core's fingerprint of its bytes, and makes no fingerprint of its own", (t) => {
  const text = readFileSync(join(engine, 'files.ts'), 'utf8')
  assert.equal(text.includes('createHash'), false, 'files.ts makes a fingerprint of its own')
  assert.equal(/\bprintOf\b/.test(text), false, 'the copy of the fingerprint is removed')
  const folder = join(engine, '..', '..', 'results', 'engine', 'one-print')
  rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  mkdirSync(folder, { recursive: true })
  t.after(() => rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }))
  const bytes = new TextEncoder().encode('the bytes of a file\n')
  writeFileSync(join(folder, 'file.txt'), bytes)
  assert.deepEqual(printsAt(folder), { 'file.txt': fingerprintOf(bytes) })
})
