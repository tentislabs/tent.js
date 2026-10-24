import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildProject, describeProject } from '../../build/index.ts'
import { guardedFetch } from '../../connect/index.ts'
import type { App } from '../../engine/index.ts'
import { createEngine, writeKey } from '../../engine/index.ts'
import type { History } from '../../history/index.ts'
import { openHistory } from '../../history/index.ts'
import type { Target } from '../../publish/index.ts'
import { followHistory, publish, serveSync } from '../../publish/index.ts'
import { tent } from '../shell.ts'
import { endedBeforeFolders, untilMinute, workOf } from './secured.ts'
import { notDropped } from './started.ts'

// An app that runs as its own server, published to under steady load, and moved to a second engine both ways that
// the framework gives: with the app stopped, and with no answered write lost.

const shop = fileURLToPath(new URL('./movedShop/', import.meta.url))
const fetched = guardedFetch({ mode: 'development' })
const flow = 'flows/waiting.ts'
const order = ['$', '{input.order}'].join('')

/** An engine of the test that runs the shop and serves its history, as `tent start` does, and how to reach it. */
interface Server {
  app: App
  history: History
  data: string
  address: string
  close(): Promise<void>
}

/** The address of the engine of a data folder, as its `engine.json` tells it. */
const addressOf = (data: string): string =>
  `http://127.0.0.1:${JSON.parse(readFileSync(join(data, 'engine.json'), 'utf8')).port}`

/** Opens a bundle on a data folder in an engine of its own, with its history behind the addresses of publishing. */
async function serverOn(t: TestContext, bundle: string, data: string, insecure = false): Promise<Server> {
  const engine = createEngine({ port: 0, notices: false })
  // A writer whose reader is on this computer is found over a connection that is not secure.
  const app = await engine.open(bundle, { dataFolder: data, ...(insecure ? { insecure: true } : {}) })
  const history = openHistory(data)
  serveSync(engine, app, history)
  let closed = false
  const close = async (): Promise<void> => {
    if (closed) return
    closed = true
    await engine.close()
    history.close()
  }
  endedBeforeFolders(t, close)
  return { app, history, data, address: addressOf(data), close }
}

/** The project on a computer of the test, with its own history, which records a point and publishes it. */
function computer(
  t: TestContext,
  folder: string,
): {
  project: string
  history: History
  save(): Promise<void>
  edit(from: string, to: string): void
} {
  const project = join(folder, 'here')
  cpSync(shop, project, { recursive: true })
  const history = openHistory(join(project, '.tent'))
  endedBeforeFolders(t, async () => history.close())
  return {
    project,
    history,
    async save() {
      const { description, findings } = await describeProject(project)
      assert.deepEqual(
        findings.filter((one) => one.level === 'error'),
        [],
      )
      history.record(project, { by: { kind: 'person', id: 'ada' }, kind: 'command', checked: true, description })
    },
    edit(from, to) {
      const file = join(project, flow)
      const text = readFileSync(file, 'utf8')
      assert.ok(text.includes(from))
      writeFileSync(file, text.replace(from, to))
    },
  }
}

/** Calls a function of an app at its address as a visitor, with the cookie that it carries. */
async function called(
  address: string,
  name: string,
  input: object,
  cookie = '',
): Promise<{ status: number; body: Record<string, unknown> }> {
  const answer = await fetch(`${address}/_t/call/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ input }),
  })
  return { status: answer.status, body: Object(await answer.json()) }
}

/** What a moved app is held to: a server with its notes, a file, a sealed column, a waiting run and two versions. */
interface Standing {
  a: Server
  here: ReturnType<typeof computer>
  to: Target
  run: string
  file: { id: string; bytes: string }
  notes: unknown
  versions: { one: string; two: string }
  key: string
}

/**
 * Starts the first engine with the key of the secrets, publishes the shop to it, adds a note that holds a sealed
 * secret and an uploaded file, starts a run that waits, and publishes a second version while it waits.
 */
async function standing(t: TestContext, folder: string, insecure = false): Promise<Standing> {
  const server = join(folder, 'server')
  cpSync(shop, server, { recursive: true })
  const built = await buildProject(server, { for: 'release' })
  assert.deepEqual(
    built.findings.filter((one) => one.level === 'error'),
    [],
  )
  const data = join(folder, 'a')
  const key = randomBytes(32).toString('base64')
  cpSync(shop, join(folder, 'unused'), { recursive: true })
  writeFileSync(join(folder, 'secret.key'), `${key}\n`)
  cpSync(join(folder, 'secret.key'), join(data, 'secret.key'))
  const a = await serverOn(t, built.bundleFolder, data, insecure)
  const here = computer(t, folder)
  const to = { address: a.address, key: writeKey(a.app, { name: 'publish', rights: ['read', 'push', 'publish'] }).key }
  await here.save()
  const one = await publish({ project: here.project, history: here.history, to, fetch: fetched })
  // A visitor uploads a file and stores it with a note, whose secret is sealed.
  const bytes = 'the words of the file of a note'
  const upload = await fetch(`${a.address}/_t/files?name=note.txt`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: bytes,
  })
  assert.equal(upload.status, 200)
  const cookie = String(upload.headers.get('set-cookie')).split(';')[0] ?? ''
  const id = String(Object(Object(await upload.json()).value).id)
  const added = await called(
    a.address,
    'addNote',
    { title: 'first', secret: 'the code of the door', picture: id },
    cookie,
  )
  assert.equal(added.status, 200, JSON.stringify(added.body))
  const { run } = notDropped(await a.app.start('waiting', { order: 'one' }, { as: 'system' }))
  here.edit(`return step('done', () => \`approved ${order}\`)`, `return step('done', () => \`approved anew ${order}\`)`)
  await here.save()
  const two = await publish({ project: here.project, history: here.history, to, fetch: fetched })
  const notes = (await called(a.address, 'allNotes', {})).body
  assert.equal(JSON.stringify(notes).includes('the code of the door'), true, 'the sealed column opens')
  return { a, here, to, run, file: { id, bytes }, notes, versions: { one: one.version, two: two.version }, key }
}

/** Holds the second engine to what the first answered: its notes, the file, the sealed column, the run, and --back. */
async function heldAsBefore(s: Standing, b: Server): Promise<void> {
  assert.deepEqual((await called(b.address, 'allNotes', {})).body, s.notes)
  const file = await fetch(`${b.address}/_t/files/${s.file.id}`)
  assert.equal(file.status, 200)
  assert.equal(await file.text(), s.file.bytes)
  assert.equal(b.app.versions().find((one) => one.running)?.id, s.versions.two)
  b.app.runs.approve(s.run, 'approved')
  assert.equal(await b.app.runs.wait(s.run), 'approved one', 'the run goes on with the code it started with')
  const to = { address: b.address, key: s.to.key }
  const back = await publish({ project: s.here.project, history: s.here.history, to, fetch: fetched, back: true })
  assert.equal(back.version, s.versions.one)
  assert.equal(b.app.versions().find((one) => one.running)?.id, s.versions.one)
}

test('[41-10] publishing a new version to a self-hosted app causes no failed request under steady load', async (t) => {
  const folder = workOf(t, 'load')
  const s = await standing(t, folder)
  let asked = 0
  const failed: string[] = []
  let going = true
  const loads = Array.from({ length: 4 }, async () => {
    while (going) {
      asked++
      try {
        const answer = await called(s.a.address, 'allNotes', {})
        if (answer.status !== 200) failed.push(`${answer.status} ${JSON.stringify(answer.body)}`)
      } catch (error) {
        failed.push(String(error))
      }
    }
  })
  await new Promise((done) => setTimeout(done, 500))
  s.here.edit('approved anew', 'approved once more')
  await s.here.save()
  const three = await publish({ project: s.here.project, history: s.here.history, to: s.to, fetch: fetched })
  await new Promise((done) => setTimeout(done, 500))
  going = false
  await Promise.all(loads)
  assert.equal(s.a.app.versions().find((one) => one.running)?.id, three.version)
  assert.ok(asked > 100, `${asked} requests were made`)
  assert.deepEqual(failed, [])
})

test('[41-10] an app that is stopped, whose backup, files, versions, history, settings and secrets are copied to a second engine with the same key on the same version, answers there as it did', async (t) => {
  const folder = workOf(t, 'stopped')
  const s = await standing(t, folder)
  // A last backup is taken from the running engine, and then it is stopped.
  const lines: string[] = []
  const backup = await tent(['data', 'backup', '--data', s.a.data, '--json'], {
    folder,
    out: (line) => lines.push(line),
  })
  assert.equal(backup, 0, lines.join('\n'))
  const file = String(Object(JSON.parse(lines.join('\n')).value).file)
  await s.a.close()
  const data = join(folder, 'b')
  for (const one of ['files', 'versions', 'history.db', 'settings.live', 'secrets.live'])
    if (existsSync(join(s.a.data, one))) cpSync(join(s.a.data, one), join(data, one), { recursive: true })
  mkdirSync(data, { recursive: true })
  cpSync(join(folder, 'secret.key'), join(data, 'secret.key'))
  const b = await serverOn(t, join(data, 'versions', s.versions.two), data)
  const restored = await tent(['data', 'restore', file, '--data', data], { folder, out: () => undefined })
  assert.equal(restored, 0)
  await heldAsBefore(s, b)
})

test('[41-10] an app that is moved with no answered write lost: a second engine joins as a near reader, is current, and is made the writer by take-over once the first is stopped', async (t) => {
  const folder = workOf(t, 'reader')
  const s = await standing(t, folder, true)
  // The key of the reader is made on the writer, with the right copy: it reads the data and the history.
  const readerKey = writeKey(s.a.app, { name: 'reader', rights: ['copy'] }).key
  const data = join(folder, 'b')
  mkdirSync(data, { recursive: true })
  cpSync(join(folder, 'secret.key'), join(data, 'secret.key'))
  const engine = createEngine({ port: 0, notices: false })
  const app = await engine.read({ from: s.a.address, key: readerKey, dataFolder: data, insecure: true })
  const history = openHistory(data)
  const following = followHistory({ history, from: { address: s.a.address, key: readerKey }, fetch: fetched })
  serveSync(engine, app, history)
  endedBeforeFolders(t, async () => {
    following.close()
    await engine.close()
    history.close()
  })
  // A write answered on the first engine just before it stops is on the second.
  const last = await called(s.a.address, 'addNote', { title: 'last', secret: 'the last code' })
  assert.equal(last.status, 200)
  await untilMinute(
    async () =>
      app.at().current && JSON.stringify((await called(addressOf(data), 'allNotes', {})).body).includes('last'),
    'the reader current',
    30_000,
  )
  const notes = (await called(s.a.address, 'allNotes', {})).body
  // The history it follows is taken at once, as its timer takes it every ten seconds.
  await following.now()
  assert.equal(history.pointer('live'), s.a.history.pointer('live'))
  await s.a.close()
  // A reader takes over once the beats of its writer have stopped for long enough: it asks again until then.
  await untilMinute(
    () =>
      app.takeOver().then(
        () => true,
        () => false,
      ),
    'the take-over',
    30_000,
  )
  const b: Server = { app, history, data, address: addressOf(data), close: async () => undefined }
  await heldAsBefore({ ...s, notes }, b)
})
