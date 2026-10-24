import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { newSecretKey } from '../index.ts'
import { codeOf, running, system } from './apps.ts'

const variable = 'TENT_SECRET_KEY'

/** The notes as an app that is opened on the folder reads them. */
const notesOf = (rows: unknown): string[] =>
  (Array.isArray(rows) ? rows : []).map((row) => String(Reflect.get(Object(row), 'note')))

test('[45-13] an app opened with secretKey seals and opens with that key alone: neither TENT_SECRET_KEY of the program nor a key file of the folder, and none is written', async (t) => {
  const [own, programs] = [newSecretKey(), newSecretKey()]
  const was = process.env[variable]
  process.env[variable] = programs
  t.after(() => {
    if (was === undefined) delete process.env[variable]
    else process.env[variable] = was
  })
  const run = await running(t, { project: 'valued', open: { secretKey: own } })
  await run.app.call('keep', { title: 'one', note: 'what is kept', pin: 1 }, { as: system })
  assert.deepEqual(notesOf(await run.app.call('kept', {}, { as: system })), ['what is kept'])
  await run.app.close()
  assert.equal(existsSync(join(run.dataFolder, 'secret.key')), false, 'no key file is written')
  const data = new DatabaseSync(join(run.dataFolder, 'data.db'), { readOnly: true })
  const stored = String(data.prepare('SELECT note FROM "vault"').get()?.note)
  data.close()
  assert.equal(stored.includes('what is kept'), false)
  // Opened with the program's key, the value does not open; opened with its own again, it does.
  const wrong = await run.engine.open(run.bundle.folder, { dataFolder: run.dataFolder, mode: 'test' })
  assert.equal(await codeOf(wrong.call('kept', {}, { as: system })), 'T0019')
  await wrong.close()
  const again = await run.engine.open(run.bundle.folder, { dataFolder: run.dataFolder, mode: 'test', secretKey: own })
  assert.deepEqual(notesOf(await again.call('kept', {}, { as: system })), ['what is kept'])
  await again.close()
  // A key that is not one is refused.
  await assert.rejects(
    run.engine.open(run.bundle.folder, { dataFolder: run.dataFolder, mode: 'test', secretKey: 'not a key' }),
    { code: 'T0013' },
  )
})
