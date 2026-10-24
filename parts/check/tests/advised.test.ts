import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Facts } from '../../core/internal.ts'
import { finding } from '../../core/internal.ts'
import { checkRules } from '../ours.ts'
import { copyOf, lineWith } from './copies.ts'

test('[45-10] the note T2029 that a running app gave is written by `tent check` at the file and the line of the table it names, and alone the check says nothing', async () => {
  // The passing project finds nothing alone; the failing one is the same app, whose running app gave advice.
  assert.deepEqual((await checkRules(copyOf(join('T2029', 'pass'), 'T2029-pass'))).findings, [])
  const folder = copyOf(join('T2029', 'fail'), 'T2029-fail')
  const advice = finding(
    'T2029',
    "The query `openNotes` reads the whole table `notes` past its slow bar: `indexes: [['body']]` would read it by an index.",
    { fix: "Add `indexes: [['body']]` to the table." },
    'note',
  )
  const facts: Facts = { tableFindings: [advice], waitingStepNames: {} }
  const { findings } = await checkRules(folder, { facts })
  const text = readFileSync(join(folder, 'functions', 'notes.ts'), 'utf8')
  assert.deepEqual(
    findings
      .filter((one) => one.code === 'T2029')
      .map((one) => [one.level, one.where?.file, one.where?.line, one.where?.definition]),
    [['note', 'functions/notes.ts', lineWith(text, "table('notes'"), 'notes']],
  )
  // With no facts handed in, nothing is advised.
  assert.deepEqual(
    (await checkRules(folder)).findings.filter((one) => one.code === 'T2029'),
    [],
  )
})
