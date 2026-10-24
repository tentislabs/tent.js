import assert from 'node:assert/strict'
import { join } from 'node:path'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import { makeSecretKey, replaceSecretKey } from '../../engine/index.ts'
import { dataPlace, openOn } from './desks.ts'
import { copyOf } from './projects.ts'

const system = { as: { kind: 'system' } } as const

const emailsOf = (rows: unknown): unknown[] =>
  (Array.isArray(rows) ? rows : []).map((one) => Reflect.get(Object(one), 'email'))

test('[45-6] after the key of the secrets is replaced, an equal value of a findable sealed column still finds the row written before', async (t) => {
  const project = copyOf(t, 'ruledColumns')
  const built = await buildProject(project, { for: 'dev', out: join(project, 'bundle') })
  const dataFolder = dataPlace(t)
  makeSecretKey(dataFolder)
  const first = await openOn(t, built.bundleFolder, dataFolder)
  await first.app.write([{ add: 'accounts', values: { email: 'ada@example.com' } }], system)
  const asked = { from: 'accounts', where: { col: 'email', is: 'ada@example.com' } }
  assert.deepEqual(emailsOf(await first.app.read(asked, system)), ['ada@example.com'])
  await first.engine.close()
  await replaceSecretKey(dataFolder)
  const again = await openOn(t, built.bundleFolder, dataFolder)
  assert.deepEqual(emailsOf(await again.app.read(asked, system)), ['ada@example.com'], 'found under the new key')
  // A row written under the new key is found as well.
  await again.app.write([{ add: 'accounts', values: { email: 'bob@example.com' } }], system)
  assert.deepEqual(
    emailsOf(await again.app.read({ from: 'accounts', where: { col: 'email', is: 'bob@example.com' } }, system)),
    ['bob@example.com'],
  )
})
