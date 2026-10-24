import assert from 'node:assert/strict'
import { test } from 'node:test'
import { makeSecretKey } from '../index.ts'
import { addUser, running } from './apps.ts'

test('[20-1a] [51-6] a remembered answer whose work read a sealed column is given to a second caller, the reads made again by the seal an action is handed', async (t) => {
  const { app, dataFolder } = await running(t, { project: 'rememberSealed' })
  makeSecretKey(dataFolder)
  const ada = await addUser(app, 'Ada')
  const bo = await addUser(app, 'Bo')
  await app.call('addCode', { code: 'first' }, { as: ada })
  const seen = String(await app.call('codesSeen', { n: 1 }, { as: ada }))
  assert.match(seen, /^first \d+$/, 'the work reads the sealed code')
  assert.equal(await app.call('codesSeen', { n: 1 }, { as: bo }), seen, 'the second caller was not given the answer')
})
