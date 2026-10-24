import assert from 'node:assert/strict'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import type { App } from '../../engine/index.ts'
import { createEngine } from '../../engine/index.ts'
import { testClock } from '../clock.ts'
import { testSecrets } from '../secrets.ts'
import { command } from './desks.ts'
import { closing, copyOf, filesIn } from './projects.ts'
import type { S3StandIn } from './s3StandIn.ts'
import { s3StandIn } from './s3StandIn.ts'

const system = { as: { kind: 'system' } } as const

/** The app of the archive in an engine of the test's own, its backups in a store where one is handed. */
async function archivedApp(t: TestContext, store?: S3StandIn) {
  const project = copyOf(t, 'archived')
  if (store) {
    const file = join(project, 'tent.ts')
    writeFileSync(
      file,
      readFileSync(file, 'utf8')
        .replace("import { project } from 'tentjs'", "import { project, s3, secret } from 'tentjs'")
        .replace(
          'backups: { every: false, keep: 8 },',
          `backups: { every: false, keep: 8, store: s3({ url: '${store.url}', bucket: 'tent', key: secret('storeKey') }) },`,
        ),
    )
  }
  const built = await buildProject(project, { for: 'dev', out: join(project, 'bundle') })
  const dataFolder = join(project, 'data')
  const { clock, moves } = testClock()
  const engine = createEngine({ port: 0, makers: { clock: () => clock } })
  closing(t, () => engine.close())
  testSecrets(dataFolder, built.description, store ? { storeKey: store.key } : {})
  const app = await engine.open(built.bundleFolder, { dataFolder, mode: 'test', address: '*' })
  return { app, engine, dataFolder, moves }
}

/** Some minutes of notes, each with a sealed text that no archive may hold open. */
async function minutes(app: App, moves: { advance(by: string): void }, count: number): Promise<void> {
  for (let m = 1; m <= count; m++) {
    moves.advance('1 minute')
    await app.call('writeNote', { title: `note ${m}`, secret: `sealed text of minute ${m}` }, system)
  }
}

test('[45-19.1] the archive in the folder of the backups and in a store holds sealed text alone, and no secret', async (t) => {
  const here = await archivedApp(t)
  await command(here.app, here.dataFolder, 'data', { what: 'backup' })
  await minutes(here.app, here.moves, 30)
  await here.engine.close()
  const archive = join(here.dataFolder, 'backups', 'archive')
  const parts = filesIn(archive)
  assert.ok(parts.length > 0, 'the archive lies in backups/archive/')
  for (const name of parts) {
    const text = readFileSync(join(archive, name)).toString('latin1')
    assert.equal(text.includes('sealed text of minute'), false, `${name} holds no sealed value open`)
  }

  const store = await s3StandIn(t)
  const there = await archivedApp(t, store)
  await command(there.app, there.dataFolder, 'data', { what: 'backup' })
  await minutes(there.app, there.moves, 30)
  await there.engine.close()
  assert.ok(store.objects.size > 1)
  for (const [name, bytes] of store.objects) {
    const text = Buffer.from(bytes).toString('latin1')
    assert.equal(text.includes('sealed text of minute'), false, `${name} holds no sealed value open`)
    assert.equal(text.includes(store.key), false, `${name} holds no secret`)
  }
})

test('[45-19.2] a restore to a moment asked with no admin token, with a wrong one, or by a caller of the app, is refused and restores nothing', async (t) => {
  const held = await archivedApp(t)
  await command(held.app, held.dataFolder, 'data', { what: 'backup' })
  const before = new Date(Date.now()).toISOString()
  await minutes(held.app, held.moves, 5)
  const { port, token } = JSON.parse(readFileSync(join(held.dataFolder, 'engine.json'), 'utf8'))
  const asked = async (headers: Record<string, string>, host = '127.0.0.1') =>
    held.app.request(
      new Request(`http://${host}:${port}/_t/admin/data`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify({ args: { what: 'restore', at: before } }),
      }),
    )
  const tokens: Record<string, string>[] = [{}, { authorization: `Bearer ${'x'.repeat(String(token).length)}` }]
  for (const headers of tokens) {
    const answer = await asked(headers)
    const body: Record<string, unknown> = Object(await answer.json().catch(() => ({})))
    assert.notEqual(body.ok, true, 'refused')
  }
  // A caller of the app comes from the network with the token it does not have, through the app's own address.
  const answer = await asked({ origin: 'https://shop.example.com' }, 'localhost')
  assert.notEqual(Object(await answer.json().catch(() => ({}))).ok, true)
  const rows: unknown = await held.app.read({ from: 'notes' }, system)
  assert.equal(Array.isArray(rows) ? rows.length : 0, 5 - 1, 'nothing was restored')
  assert.deepEqual(
    readdirSync(join(held.dataFolder, 'backups')).filter((one) => one !== 'archive').length,
    1,
    'no backup was taken for a restore',
  )
})
