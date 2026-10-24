import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import { createEngine } from '../../engine/index.ts'
import { testSecrets } from '../secrets.ts'
import { closing, copyOf } from './projects.ts'

const system = { as: { kind: 'system' } } as const

test('[22-23@7a] a call that arrives while the app is opened again for other makers waits for the new opening, and is answered by it', async (t) => {
  const project = copyOf(t, 'reading')
  const first = await buildProject(project, { for: 'dev', out: join(project, 'first') })
  const file = join(project, 'engine.ts')
  const read = 'read: async (bytes, info) => scanned(bytes, info, secrets.SCAN_KEY.reveal()),'
  writeFileSync(file, readFileSync(file, 'utf8').replace(read, "read: async () => 'read by the second makers',"))
  const second = await buildProject(project, { for: 'dev', out: join(project, 'second') })
  const dataFolder = join(project, 'data')
  testSecrets(dataFolder, first.description, { SCAN_KEY: 'key-of-the-scanner' })
  const engine = createEngine({ port: 0 })
  closing(t, () => engine.close())
  const app = await engine.open(first.bundleFolder, { dataFolder, mode: 'test' })
  const { port } = JSON.parse(readFileSync(join(dataFolder, 'engine.json'), 'utf8'))
  const id = String(
    await app.call(
      'keep',
      { base64: Buffer.from([1, 2]).toString('base64'), name: 'page.scan', kind: 'application/x-scan' },
      system,
    ),
  )
  await app.add(second.bundleFolder)
  let settled = false
  const switching = app.switch(second.versionId).finally(() => {
    settled = true
  })
  // Members and requests of the web, sent one after another while the switch opens the app again: each is
  // answered, by the opening before or by the new one, and none is refused for an app that is closed.
  const sent: Promise<string>[] = []
  const asked: Promise<number>[] = []
  while (!settled) {
    sent.push(app.call('words', { id }, system).then(String, (error) => `failed ${error.code}`))
    asked.push(
      fetch(`http://localhost:${port}/_t/health`).then(
        (one) => one.status,
        () => 0,
      ),
    )
    await new Promise((done) => setImmediate(done))
  }
  const answers = await Promise.all(sent)
  const statuses = await Promise.all(asked)
  assert.equal((await switching).opens, true, JSON.stringify([answers, statuses]))
  assert.ok(answers.length > 0)
  assert.deepEqual(
    answers.filter((one) => one.startsWith('failed')),
    [],
  )
  // A file that was not read before is read by what the new makers made: the words of one that was are kept.
  const fresh = String(
    await app.call(
      'keep',
      { base64: Buffer.from([3, 4]).toString('base64'), name: 'next.scan', kind: 'application/x-scan' },
      system,
    ),
  )
  assert.equal(await app.call('words', { id: fresh }, system), 'read by the second makers')
  assert.ok(
    statuses.every((status) => status !== 421),
    `a request was told the app is not here: ${statuses}`,
  )
})
