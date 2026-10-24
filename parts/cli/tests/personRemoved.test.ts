import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildProject } from '../../build/index.ts'
import { createEngine, makeSecretKey, writeConnection } from '../../engine/index.ts'
import { copied, typed } from './typed.ts'

const system = { kind: 'system' } as const

test('[20-7@8a] the removal of a person removes the keys that were made for them and their connections to services', async (t) => {
  const engine = createEngine({ port: 0 })
  t.after(() => engine.close())
  const project = copied(t, `removed-${process.pid}`, 'served')
  const built = await buildProject(project, { for: 'dev' })
  assert.deepEqual(
    built.findings.filter((one) => one.level === 'error'),
    [],
  )
  // The tokens of a connection are sealed with the key of the secrets.
  makeSecretKey(join(project, '.tent'))
  const app = await engine.open(built.bundleFolder, { dataFolder: join(project, '.tent'), mode: 'test' })
  for (const name of ['Ada', 'Bo']) await app.call('addUser', { name, roles: [] }, { as: system })
  const rows = await app.read({ from: 'users' }, { as: system })
  const idOf = (name: string): string =>
    String(Object((Array.isArray(rows) ? rows : []).find((one) => Object(one).name === name)).id)
  const [ada, bo] = [idOf('Ada'), idOf('Bo')]
  await app.call('makeUserKey', { user: ada }, { as: system })
  await app.call('makeUserKey', { user: bo }, { as: system })
  await app.call('makeKey', { name: 'of nobody' }, { as: system })
  writeConnection(app, ada, 'github')
  writeConnection(app, bo, 'github')
  const removed = await typed(project, 'data', 'user', 'remove', ada, '--yes', '--json')
  assert.equal(removed.ended, 0, removed.printed)
  const left: unknown = await app.call('listKeys', {}, { as: system })
  assert.deepEqual((Array.isArray(left) ? left.map(String) : []).sort(), ['of a user', 'of nobody'])
  assert.deepEqual(await app.call('listConnections', { user: ada }, { as: system }), [])
  assert.deepEqual(await app.call('listConnections', { user: bo }, { as: system }), ['github'])
})
