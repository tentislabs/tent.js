import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { openHistory } from '../../history/index.ts'
import { copied, typed } from './typed.ts'

test('[40-3] tent check marks now with what it found, after recording a point where the files are no longer those of now, and records none where they are', async (t) => {
  const project = copied(t, 'check-marks')
  const first = await typed(project, 'check', '--json')
  assert.equal(first.ended, 0, first.printed)
  const read = () => {
    const history = openHistory(join(project, '.tent'))
    try {
      const now = history.pointer('now')
      const point = now === undefined ? undefined : history.read(now)
      return { now, checked: point?.checked, described: point?.description !== undefined, count: history.list().length }
    } finally {
      history.close()
    }
  }
  const marked = read()
  assert.equal(marked.checked, true, 'the files passed, and now says so')
  assert.equal(marked.described, true, 'now holds the description the check made')

  // Nothing changed: no point is recorded, and now stands where it stood.
  assert.equal((await typed(project, 'check', '--json')).ended, 0)
  assert.deepEqual([read().now, read().count], [marked.now, marked.count])

  // A file changed: a point is recorded for it, and it is marked.
  const tables = join(project, 'tables', 'orders.ts')
  writeFileSync(tables, readFileSync(tables, 'utf8').replace('title: text()', 'title: text({ max: 90 })'))
  assert.equal((await typed(project, 'check', '--json')).ended, 0)
  const after = read()
  assert.notEqual(after.now, marked.now)
  assert.equal(after.checked, true)
})
