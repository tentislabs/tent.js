import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { cpSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildProject } from '../../build/index.ts'
import type { Caller } from '../../core/index.ts'
import { createEngine } from '../../engine/index.ts'
import { endedBeforeFolders, workOf } from './secured.ts'
import { notDropped } from './started.ts'

// The attacks of the reviewer on moving an app: a copy of its data folder, started where it should not be.

const shop = fileURLToPath(new URL('./movedShop/', import.meta.url))
const pages = fileURLToPath(new URL('../../docs/pages/', import.meta.url))
const system: Caller = { kind: 'system' }

/** Builds the moved shop in a folder of its own, with its flow changed as it is handed. Answers the bundle and its version. */
async function built(
  folder: string,
  name: string,
  edit?: [string, string],
): Promise<{ bundle: string; version: string }> {
  const project = join(folder, name)
  cpSync(shop, project, { recursive: true })
  if (edit) {
    const file = join(project, 'flows', 'waiting.ts')
    writeFileSync(file, readFileSync(file, 'utf8').replace(edit[0], edit[1]))
  }
  const made = await buildProject(project, { for: 'release' })
  assert.deepEqual(
    made.findings.filter((one) => one.level === 'error'),
    [],
  )
  return { bundle: made.bundleFolder, version: made.versionId }
}

/** Opens a bundle on a data folder in an engine of its own, ended with the test. */
async function openedOn(t: TestContext, bundle: string, data: string) {
  const engine = createEngine({ port: 0, notices: false })
  endedBeforeFolders(t, () => engine.close())
  return { engine, app: await engine.open(bundle, { dataFolder: data }) }
}

test('[05-18.10] the docs of moving an app say to stop the first engine before the copy starts, and why: two engines under one name are two apps, and each fires its own schedules', () => {
  const found = readdirSync(pages)
    .filter((one) => one.endsWith('.md'))
    .map((one) => ({ name: one, text: readFileSync(join(pages, one), 'utf8') }))
    .filter(({ text }) => /\bmov(e|ing) an app\b|\ban app is moved\b/i.test(text))
  assert.ok(found.length > 0, 'a page of the shipped docs tells how an app is moved')
  assert.ok(
    found.some(({ text }) => /stop/i.test(text) && /schedule/i.test(text) && /two apps/i.test(text)),
    found.map((one) => one.name).join(', '),
  )
})

test('[05-18.11] a copy that is started with another key of the secrets opens no sealed column, and the error names the key', async (t) => {
  const folder = workOf(t, 'review-key')
  const { bundle } = await built(folder, 'shop')
  const first = join(folder, 'a')
  cpSync(shop, join(folder, 'unused'), { recursive: true })
  writeFileSync(join(folder, 'key-a'), `${randomBytes(32).toString('base64')}\n`)
  cpSync(join(folder, 'key-a'), join(first, 'secret.key'))
  const a = await openedOn(t, bundle, first)
  await a.app.call('addNote', { title: 'first', secret: 'the code of the door' }, { as: system })
  assert.match(JSON.stringify(await a.app.call('allNotes', {}, { as: system })), /the code of the door/)
  await a.engine.close()
  // The copy is given another key.
  const second = join(folder, 'b')
  cpSync(first, second, { recursive: true })
  rmSync(join(second, 'engine.json'), { force: true })
  writeFileSync(join(second, 'secret.key'), `${randomBytes(32).toString('base64')}\n`)
  const b = await openedOn(t, bundle, second)
  const failed = await b.app.call('allNotes', {}, { as: system }).then(
    (answer) => `answered ${JSON.stringify(answer)}`,
    (error: unknown) => String(Reflect.get(Object(error), 'message')),
  )
  assert.doesNotMatch(failed, /^answered/)
  assert.doesNotMatch(failed, /the code of the door/)
  assert.match(failed, /key/i)
})

test('[05-18.12] a copy whose versions/ lacks the version that a waiting run is pinned to: that run fails with an error that names the version, and the app opens', async (t) => {
  const folder = workOf(t, 'review-versions')
  const one = await built(folder, 'one')
  const order = ['$', '{input.order}'].join('')
  const two = await built(folder, 'two', [
    `return step('done', () => \`approved ${order}\`)`,
    `return step('done', () => \`approved anew ${order}\`)`,
  ])
  assert.notEqual(one.version, two.version)
  const first = join(folder, 'a')
  const a = await openedOn(t, one.bundle, first)
  const { run } = notDropped(await a.app.start('waiting', { order: 'one' }, { as: system }))
  await new Promise((done) => setTimeout(done, 500))
  await a.engine.close()
  const second = join(folder, 'b')
  cpSync(first, second, { recursive: true })
  rmSync(join(second, 'engine.json'), { force: true })
  rmSync(join(second, 'versions', one.version), { recursive: true, force: true })
  const b = await openedOn(t, two.bundle, second)
  assert.equal(b.app.versions().find((each) => each.running)?.id, two.version)
  b.app.runs.approve(run, 'approved')
  const ended = await b.app.runs.wait(run).then(
    (answer) => `answered ${JSON.stringify(answer)}`,
    (error: unknown) => String(Reflect.get(Object(error), 'message')),
  )
  assert.match(ended, new RegExp(one.version))
})
