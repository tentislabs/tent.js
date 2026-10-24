import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { copied, typed } from './typed.ts'

test('[15-6@4] `tent check --data` on a data.db that is no database names the file, says that it is no database of an engine, and says how it is mended', async (t) => {
  const project = copied(t, 'check-no-database')
  const data = join(project, '..', 'data')
  mkdirSync(data, { recursive: true })
  const file = join(data, 'data.db')
  writeFileSync(file, 'bytes that are no database, and long enough to be read as the head of one '.repeat(40))
  const checked = await typed(project, 'check', '--data', data, '--json')
  const [found] = (checked.answer.findings ?? []).filter((one) => one.code === 'T0018')
  assert.ok(found, checked.printed)
  assert.equal(checked.ended, 1)
  assert.equal(found.message.includes(file), true, found.message)
  assert.match(found.message, /no database/)
  assert.doesNotMatch(found.message, /The store is not open/)
  assert.match(String(found.fix), /--data/)
})
