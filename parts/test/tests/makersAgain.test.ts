import assert from 'node:assert/strict'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import { createEngine } from '../../engine/index.ts'
import { testApp } from '../index.ts'
import { testSecrets } from '../secrets.ts'
import { current, level, until } from './many.ts'
import { closing, copyOf, tempOf } from './projects.ts'

const system = { as: { kind: 'system' } } as const
/** How many requests the reader of a test handed on to its writer, as its log holds them. */
function handed(temp: string): number {
  const home = String(readdirSync(temp).find((name) => name.startsWith('tent-test-')))
  const log = new DatabaseSync(join(temp, home, 'reader-2', 'logs.db'), { readOnly: true })
  try {
    return log.prepare('SELECT * FROM "calls" WHERE "kind" = ?').all('handed').length
  } finally {
    log.close()
  }
}

const scan = (bytes: number[]): string => Buffer.from(new Uint8Array(bytes)).toString('base64')

test('[22-23@7a] a switch to a version whose engine.ts makes other things opens the app again: the app is the same object, and what the new makers made is used from then on', async (t) => {
  const project = copyOf(t, 'reading')
  const first = await buildProject(project, { for: 'dev', out: join(project, 'first') })
  // The second version reads the same kind with words of its own.
  const file = join(project, 'engine.ts')
  const was = readFileSync(file, 'utf8')
  const read = 'read: async (bytes, info) => scanned(bytes, info, secrets.SCAN_KEY.reveal()),'
  assert.ok(was.includes(read))
  writeFileSync(file, was.replace(read, "read: async () => 'read by the makers of the second version',"))
  const second = await buildProject(project, { for: 'dev', out: join(project, 'second') })
  assert.notEqual(first.description.server?.makers, second.description.server?.makers)

  const dataFolder = join(project, 'data')
  testSecrets(dataFolder, first.description, { SCAN_KEY: 'key-of-the-scanner' })
  const engine = createEngine({ port: 0 })
  closing(t, () => engine.close())
  const app = await engine.open(first.bundleFolder, { dataFolder, mode: 'test' })
  const kept = async (bytes: number[]): Promise<string> =>
    String(await app.call('keep', { base64: scan(bytes), name: 'page.scan', kind: 'application/x-scan' }, system))
  assert.match(String(await app.call('words', { id: await kept([1, 2, 3]) }, system)), /^scanned page\.scan/)

  await app.add(second.bundleFolder)
  const switched = await app.switch(second.versionId)
  assert.equal(switched.opens, true)
  // The same object answers, under the new version, with what its makers made.
  assert.equal(app.description.server?.makers, second.description.server?.makers)
  assert.equal(
    await app.call('words', { id: await kept([4, 5, 6]) }, system),
    'read by the makers of the second version',
  )

  // A switch whose makers are the same opens nothing again.
  assert.equal((await app.switch(second.versionId)).opens, false)
})

test('[22-23@7a] a reader that follows its writer to a version whose engine.ts makes other things is opened again too, and reads with what the new makers made', async (t) => {
  const temp = tempOf(t)
  const project = copyOf(t, 'reading')
  const app = await testApp({ folder: project, secrets: { SCAN_KEY: 'key-of-the-scanner' } })
  closing(t, () => app.close())
  const near = await app.reader()
  await current(app, near)
  /** Reads the words of a file with an action that changes nothing, which the reader answers itself. */
  const here = async (id: string): Promise<unknown> => {
    const answer = await near.request(
      new Request('http://localhost/_t/call/wordsHere', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost' },
        body: JSON.stringify({ input: { id } }),
      }),
    )
    return Object(await answer.json()).value
  }
  const first = String(
    await app.call('keep', { base64: scan([1, 2, 3]), name: 'page.scan', kind: 'application/x-scan' }, system),
  )
  await level(app, near)
  assert.match(String(await here(first)), /^scanned page\.scan/)
  // The second version, built from the same project with its reader changed.
  const file = join(project, 'engine.ts')
  const read = 'read: async (bytes, info) => scanned(bytes, info, secrets.SCAN_KEY.reveal()),'
  writeFileSync(
    file,
    readFileSync(file, 'utf8').replace(read, "read: async () => 'read by the makers of the second version',"),
  )
  const second = await buildProject(project, { for: 'dev', out: join(project, 'second') })
  await app.add(second.bundleFolder)
  assert.equal((await app.switch(second.versionId)).opens, true)
  const id = String(
    await app.call('keep', { base64: scan([7, 8, 9]), name: 'page.scan', kind: 'application/x-scan' }, system),
  )
  const makers = second.description.server?.makers
  await until('the reader runs the second version', () => near.description.server?.makers === makers)
  await current(app, near)
  await level(app, near)
  // The reader reads with what the makers of the second version made, and hands nothing on for it.
  const before = handed(temp)
  assert.equal(await here(id), 'read by the makers of the second version')
  assert.equal(handed(temp), before)
})
