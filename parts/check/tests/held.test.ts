import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { checkRules } from '../ours.ts'
import { copyOf } from './copies.ts'

test('[15-1@10c] T7016 notes each host, program and native module that the hold names, and the passing project has none', async () => {
  const pass = await checkRules(copyOf(join('T7016', 'pass'), 'T7016-pass'))
  assert.deepEqual(
    pass.findings.filter((one) => one.code === 'T7016'),
    [],
  )
  // A held app that names no way out raises no note of its own.
  assert.deepEqual(
    pass.findings.filter((one) => one.level === 'error'),
    [],
  )

  const found = (await checkRules(copyOf(join('T7016', 'fail'), 'T7016-fail'))).findings
  const notes = found.filter((one) => one.code === 'T7016')
  // One note for each entry of the hold, each at the project, each a note and no error.
  assert.equal(notes.length, 3)
  assert.ok(notes.every((one) => one.level === 'note'))
  assert.ok(notes.every((one) => one.docs === 'tent docs T7016'))
  assert.ok(notes.some((one) => one.message.includes('api.example.com')))
  assert.ok(notes.some((one) => one.message.includes('ffmpeg')))
  assert.ok(notes.some((one) => one.message.includes('sharp')))
  assert.deepEqual(
    found.filter((one) => one.level === 'error'),
    [],
  )
})
