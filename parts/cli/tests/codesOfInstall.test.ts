import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import test from 'node:test'
import { updateInstall } from '../install/updateInstall.ts'
import { guardedFetch } from '../../connect/index.ts'
import { endedWith, folderOf } from './bundledShop.ts'

test('[16-2@10b] T0026 for an update that is refused', async (t) => {
  const folder = folderOf(t, 'codes')
  const home = join(folder, 'home')
  // A place that serves a list that no key signed: the update is refused, and nothing changes.
  const server = createServer((_request, response) =>
    response.end(JSON.stringify({ format: 'tent.releases/1', made: 1, versions: [{ version: '9.9.9' }] })),
  )
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  endedWith(t, () => new Promise<void>((done) => server.close(() => done())))
  const at = `127.0.0.1:${(server.address() as AddressInfo).port}`
  mkdirSync(home, { recursive: true })
  writeFileSync(join(home, 'current'), '1.0.0\n')
  const update = updateInstall(home, {
    from: `http://${at}/`,
    keys: [],
    fetch: guardedFetch({ mode: 'live', privateHosts: [`http://${at}`] }),
  }).then(
    () => 'answered',
    (error: unknown) => String(Reflect.get(Object(error), 'code')),
  )
  assert.equal(await update, 'T0026')
})
