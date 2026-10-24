import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { copied, typed } from './typed.ts'

test('[15-6@4] `tent data rows` with a word that names no table is T0002: it names the word and the tables that the app has', async (t) => {
  const project = copied(t, 'data-rows-none')
  const data = join(project, '..', 'data')
  const asked = await typed(project, 'data', 'rows', 'nothere', '--data', data, '--json')
  const [found] = asked.answer.findings ?? []
  assert.deepEqual([asked.ended, found?.code], [1, 'T0002'], asked.printed)
  assert.match(found.message, /nothere/)
  assert.match(found.message, /orders, users/)
  // A table that is there is answered as before.
  const rows = await typed(project, 'data', 'rows', 'users', '--data', data, '--json')
  assert.deepEqual([rows.ended, rows.answer.value], [0, []])
})
