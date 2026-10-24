import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { describeProject } from '../../build/index.ts'
import { makeSecretKey, readSecrets, storedValues } from '../../engine/index.ts'
import type { Dev } from '../dev.ts'
import { startDev } from '../dev.ts'
import { copied } from './typed.ts'

/** A port of this computer on which nothing listens. */
async function quietPort(): Promise<number> {
  const probe = createServer()
  await new Promise<void>((done) => probe.listen(0, '127.0.0.1', done))
  const at = probe.address()
  const port = typeof at === 'object' && at !== null ? at.port : 0
  await new Promise<void>((done) => probe.close(() => done()))
  return port
}

/** A copy of the project of the sessions, whose session is ended before the copy is removed. */
function developedIn(t: TestContext, name: string): { folder: string; ended(dev: Dev): void } {
  let started: Dev | undefined
  t.after(() => started?.close())
  return {
    folder: copied(t, name, 'devs'),
    ended: (dev) => {
      started = dev
    },
  }
}

test('[31-12] tent dev is refused as a second one only where what engine.json names proves that it holds the token: the number of a program that runs, with nothing that answers, keeps no project shut', async (t) => {
  const { folder, ended } = developedIn(t, 'review-dev-proof')
  const data = join(folder, '.tent')
  mkdirSync(data, { recursive: true })
  // An engine.json that a stopped engine left: its number was given since to a program that runs, this one.
  const left = { port: await quietPort(), token: 'a-token-that-nothing-holds', pid: process.pid, mode: 'development' }
  writeFileSync(join(data, 'engine.json'), JSON.stringify(left))
  const dev = await startDev(folder, { port: 0, out: () => undefined })
  ended(dev)
  assert.notEqual(dev.port, left.port)
})

test('[31-12] tent dev --fresh empties the development data, and keeps the secrets of test data and the key of the secrets of the project', async (t) => {
  const { folder, ended } = developedIn(t, 'review-dev-fresh')
  const data = join(folder, '.tent')
  const { description } = await describeProject(folder)
  // A secret the person set with `tent secrets set`, as it does it with no engine running.
  makeSecretKey(data)
  storedValues(data, description, { kind: 'secrets', name: 'PAY_KEY', value: 'sk_test_REVIEW-0123456789' })
  const kept = Object.fromEntries(
    ['secret.key', 'secrets.test'].map((name) => [name, readFileSync(join(data, name), 'utf8')]),
  )
  ended(await startDev(folder, { port: 0, fresh: true, out: () => undefined }))
  for (const [name, text] of Object.entries(kept)) {
    assert.ok(existsSync(join(data, name)), `${name} is still there`)
    assert.equal(readFileSync(join(data, name), 'utf8'), text, name)
  }
  assert.deepEqual(readSecrets(data), ['sk_test_REVIEW-0123456789'])
})
