import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { createServer, request } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { buildProject } from '../../build/index.ts'
import { createEngine, makeSecretKey } from '../../engine/index.ts'
import type { Point } from '../../history/index.ts'
import { idOf, openHistory } from '../../history/index.ts'
import { blobsBody, blobsType } from '../blobsBody.ts'
import { followServer, publish, pull, push, serveSync } from '../index.ts'
import type { Computer, Server } from './server.ts'
import { ada, closing, computer, fetched, folderOf, sent, started } from './server.ts'

const print = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
const functions = 'functions/orders.ts'
const tables = 'tables/orders.ts'

/** What a promise was refused with, or nothing where it was kept. */
const refusal = (done: Promise<unknown>): Promise<{ code?: string; fields?: Record<string, string> } | undefined> =>
  done.then(
    () => undefined,
    (error: { code?: string; fields?: Record<string, string> }) => error,
  )

const running = (server: Server): string | undefined => server.app.versions().find((one) => one.running)?.id

/** Sends the head of a request whose body states a length, and the first bytes alone: answers the text it is answered. */
const stated = (server: Server, path: string, key: string, length: number): Promise<string> =>
  new Promise((done, failed) => {
    const url = new URL(server.address)
    const head = { 'content-type': 'application/json', 'content-length': length, authorization: `Bearer ${key}` }
    const asking = request({ host: url.hostname, port: url.port, path, method: 'POST', headers: head }, (answer) => {
      let text = ''
      answer.on('data', (chunk) => {
        text += chunk
      })
      answer.on('end', () => done(text))
    })
    asking.on('error', failed)
    asking.write('{"kind":"secret","name":"SMTP_URL","value":"')
  })

/** A server, a computer, and a first publish of the project as it lies. */
async function published(t: TestContext): Promise<{ server: Server; here: Computer; to: ReturnType<Server['key']> }> {
  const folder = folderOf(t)
  const server = await started(t, folder)
  const here = computer(t, folder, 'here')
  const to = server.key(['read', 'push', 'publish'])
  await here.save()
  await publish({ project: here.project, history: here.history, to, fetch: fetched })
  return { server, here, to }
}

/** The files of a bundle built of a computer's project as it lies, by path, with their bytes. */
async function bundleOf(here: Computer, out: string): Promise<{ version: string; files: Map<string, Uint8Array> }> {
  const built = await buildProject(here.project, { for: 'release', out })
  const files = new Map<string, Uint8Array>()
  for (const one of readdirSync(built.bundleFolder, { recursive: true, withFileTypes: true }))
    if (one.isFile()) {
      const lies = join(one.parentPath, one.name)
      files.set(lies.slice(built.bundleFolder.length + 1).replaceAll('\\', '/'), readFileSync(lies))
    }
  return { version: built.versionId, files }
}

/**
 * Sends what a publish sends, by hand: the blobs of a bundle, a point of the kind `published` named by a version
 * whose parent is what is live, and asks `/_t/publish` with a list of files as written. Answers the answer.
 */
async function sentByHand(
  server: Server,
  key: string,
  version: string,
  blobs: Uint8Array[],
  files: string,
): Promise<Record<string, unknown>> {
  await sent(server, '/_t/sync/blobs?for=bundle', blobsBody(blobs.map((one) => [print(one), one])), key, blobsType)
  const live = String(server.history.pointer('live'))
  const held: Omit<Point, 'id'> = {
    parents: [live],
    at: Date.now(),
    by: ada,
    kind: 'published',
    name: version,
    files: {},
  }
  const point = { id: idOf(held), ...held }
  await sent(server, '/_t/sync/points', { points: [point] }, key)
  const answer = await fetch(`${server.address}/_t/publish`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: `{"point":${JSON.stringify(point.id)},"version":${JSON.stringify(version)},"files":${files}}`,
  })
  return Object(await answer.json())
}

test('[05-15.7] a publish of a version that was never sent, and one whose listed files do not give that version id, is T9107', async (t) => {
  const { server, here, to } = await published(t)
  const before = running(server)
  here.edit(functions, ".limit(input('limit'))", '.limit(50)')
  const next = await bundleOf(here, join(here.project, '..', 'next'))
  here.edit(functions, '.limit(50)', '.limit(70)')
  const other = await bundleOf(here, join(here.project, '..', 'other'))
  const listed = (files: Map<string, Uint8Array>): string =>
    JSON.stringify(Object.fromEntries([...files].map(([path, bytes]) => [path, print(bytes)])))
  // Never sent: the version names files whose bytes the server lacks.
  const never = await sentByHand(server, to.key, next.version, [], listed(next.files))
  assert.equal(Object(never.error).code, 'T9107', JSON.stringify(never))
  // The description of another version under this version's id.
  const otherDescription = Object.fromEntries(next.files)
  otherDescription['description.json'] = other.files.get('description.json') ?? new Uint8Array()
  const another = await sentByHand(
    server,
    to.key,
    next.version,
    [...next.files.values(), ...other.files.values()],
    listed(new Map(Object.entries(otherDescription))),
  )
  assert.equal(Object(another.error).code, 'T9107', JSON.stringify(another))
  // The description of this version, with the bytes of a module of another version under the name of its own.
  const swapped = new Map(next.files)
  const module = [...next.files.keys()].find((path) => path.startsWith('server/') && path.endsWith('.js'))
  const theirs = [...other.files.keys()].find((path) => path.startsWith('server/') && path.endsWith('.js'))
  assert.ok(module && theirs)
  swapped.set(module, other.files.get(theirs) ?? new Uint8Array())
  const lying = await sentByHand(server, to.key, next.version, [...swapped.values()], listed(swapped))
  assert.equal(
    Object(lying.error).code,
    'T9107',
    `a module whose bytes are not those its name gives: ${JSON.stringify(lying)}`,
  )
  assert.equal(running(server), before)
})

test('[05-15.10] a secret set through /_t/publish/values is in no answer, in no row of the log, also one not yet in the file of the log, and in no later point', async (t) => {
  const { server, here, to } = await published(t)
  makeSecretKey(server.data)
  const value = 'smtp://a-value-nobody-reads.example.com:25'
  const answers = [
    await sent(server, '/_t/publish/values', { kind: 'secret', name: 'SMTP_URL', value }, to.key),
    await sent(server, '/_t/publish/values', { list: true }, to.key),
    await sent(server, '/_t/publish/values', { kind: 'secret', name: 'SMTP_URL', value, remove: 'no' }, to.key),
  ]
  here.edit(
    'tent.ts',
    "title: 'Shop' }",
    "title: 'Shop', mail: { from: 'shop@example.com', send: secret('SMTP_URL') } }",
  )
  here.edit('tent.ts', "import { project } from 'tentjs'", "import { project, secret } from 'tentjs'")
  await here.save()
  await publish({ project: here.project, history: here.history, to, fetch: fetched })
  answers.push(await sent(server, '/_t/sync/have', { points: [], blobs: [], pointers: true }, to.key))
  assert.equal(JSON.stringify(answers).includes(value), false, 'no answer holds it')
  for (const name of readdirSync(server.data).filter((one) => one.startsWith('logs.db')))
    assert.equal(readFileSync(join(server.data, name)).includes(value), false, `${name} holds no value`)
  const blobs = server.history
    .list({ pointer: 'live' })
    .flatMap((point) => [...Object.values(point.files ?? {}), ...(point.description ? [point.description] : [])])
  for (const print of blobs) assert.equal(Buffer.from(server.history.blob(print) ?? []).includes(value), false)
  assert.equal(JSON.stringify(server.history.list({ pointer: 'live' })).includes(value), false, 'no point holds it')
})

test('[05-15.11] the addresses of publishing over a connection that is not secure, from another computer through a named proxy, are not found', async (t) => {
  const folder = folderOf(t)
  const built = await buildProject(join(import.meta.dirname, 'shop'), { for: 'release', out: join(folder, 'bundle') })
  const engine = createEngine({ port: 0, proxy: { from: ['127.0.0.1', '::1'], scheme: 'header' } })
  const data = join(folder, 'data')
  mkdirSync(data, { recursive: true })
  const history = openHistory(data)
  closing(t, async () => {
    await engine.close()
    history.close()
  })
  const app = await engine.open(built.bundleFolder, { dataFolder: data, mode: 'live' })
  serveSync(engine, app, history)
  const port = Number(JSON.parse(readFileSync(join(data, 'engine.json'), 'utf8')).port)
  const asked = (headers: Record<string, string>): Promise<number> =>
    new Promise((done, failed) => {
      const sending = request(
        {
          host: '127.0.0.1',
          port,
          path: '/_t/sync/have',
          method: 'POST',
          headers: { host: `localhost:${port}`, 'content-type': 'application/json', ...headers },
        },
        (answer) => {
          answer.resume()
          answer.on('end', () => done(answer.statusCode ?? 0))
        },
      )
      sending.on('error', failed)
      sending.end(JSON.stringify({ points: [], blobs: [] }))
    })
  assert.equal(await asked({}), 403, 'from this computer the address is found, and needs a key')
  const far = { 'x-forwarded-for': '203.0.113.9', 'x-forwarded-proto': 'http' }
  assert.equal(await asked(far), 404, 'a request of another computer over http, which the proxy names, is not found')
})

test('[05-15.14] a server that follows, whose own server hands it a version with a path that climbs out, refuses it and writes nothing outside', async (t) => {
  const folder = folderOf(t)
  const bytes = new TextEncoder().encode('written outside')
  const fp = print(bytes)
  const outside = join(folder, 'climbed.txt')
  const answering = createServer((asked, answer) => {
    answer.setHeader('content-type', asked.url === '/_t/sync/blobs' ? blobsType : 'application/json')
    if (asked.url === '/_t/sync/blobs') return answer.end(blobsBody([[fp, bytes]]))
    const live = {
      version: 'f'.repeat(32),
      point: 'p'.repeat(32),
      files: { '../../climbed.txt': fp, 'a/../../../climbed.txt': fp },
    }
    answer.end(JSON.stringify({ ok: true, value: { points: [], blobs: [], pointers: {}, mode: 'live', live } }))
  })
  await new Promise<void>((done) => answering.listen(0, '127.0.0.1', done))
  closing(t, () => new Promise((done) => answering.close(done)))
  const engine = createEngine({ port: 0 })
  closing(t, () => engine.close())
  const address = `http://127.0.0.1:${(answering.address() as AddressInfo).port}`
  const followed = await refusal(
    followServer({ engine, from: { address, key: 'k'.repeat(48) }, fetch: fetched, dataFolder: join(folder, 'data') }),
  )
  assert.deepEqual([followed?.code, Object(followed?.fields).path], ['T9107', '../../climbed.txt'])
  assert.equal(existsSync(outside), false, 'no file is written outside a version folder')
})

test('[40-15] a server that follows holds what it fetched to the version that was named, as a publish does: files that give another version are not run', async (t) => {
  const folder = folderOf(t)
  const built = await buildProject(join(import.meta.dirname, 'shop'), { for: 'release', out: join(folder, 'bundle') })
  const files = new Map<string, Uint8Array>()
  for (const one of readdirSync(built.bundleFolder, { recursive: true, withFileTypes: true }))
    if (one.isFile()) {
      const lies = join(one.parentPath, one.name)
      files.set(lies.slice(built.bundleFolder.length + 1).replaceAll('\\', '/'), readFileSync(lies))
    }
  const named = 'f'.repeat(32)
  const answering = createServer((asked, answer) => {
    answer.setHeader('content-type', asked.url === '/_t/sync/blobs' ? blobsType : 'application/json')
    if (asked.url === '/_t/sync/blobs')
      return answer.end(blobsBody([...files.values()].map((one) => [print(one), one])))
    const live = {
      version: named,
      point: 'p'.repeat(32),
      files: Object.fromEntries([...files].map(([p, b]) => [p, print(b)])),
    }
    answer.end(JSON.stringify({ ok: true, value: { points: [], blobs: [], pointers: {}, mode: 'live', live } }))
  })
  await new Promise<void>((done) => answering.listen(0, '127.0.0.1', done))
  closing(t, () => new Promise((done) => answering.close(done)))
  const engine = createEngine({ port: 0 })
  closing(t, () => engine.close())
  const address = `http://127.0.0.1:${(answering.address() as AddressInfo).port}`
  const followed = await followServer({
    engine,
    from: { address, key: 'k'.repeat(48) },
    fetch: fetched,
    dataFolder: join(folder, 'data'),
  }).then(
    (one) =>
      one
        .app()
        ?.versions()
        .find((v) => v.running)?.id,
    (error: { code?: string }) => error.code,
  )
  assert.equal(followed, 'T9107', `the follower runs ${followed}, which is not the version ${named} it was told`)
})

test('[05-15.15] a holder of push who sends a point that says checked over files that fail the check, which the next person pulls and publishes, is T9101', async (t) => {
  const folder = folderOf(t)
  const server = await started(t, folder)
  const to = server.key(['read', 'push', 'publish'])
  const one = computer(t, folder, 'one')
  const two = computer(t, folder, 'two')
  await one.save()
  await publish({ project: one.project, history: one.history, to, fetch: fetched })
  await push({ history: one.history, to, fetch: fetched })
  await pull({ project: two.project, history: two.history, from: to, fetch: fetched, by: ada })
  one.edit(functions, '.where({ paid: false })', '.where({ nothing: false })')
  one.history.record(one.project, { by: ada, kind: 'command', checked: true })
  await push({ history: one.history, to, fetch: fetched })
  await pull({ project: two.project, history: two.history, from: to, fetch: fetched, by: ada })
  const before = running(server)
  const refused = await refusal(publish({ project: two.project, history: two.history, to, fetch: fetched }))
  assert.deepEqual([refused?.code, refused?.fields?.reason], ['T9101', 'check'])
  assert.equal(running(server), before)
})

test('[05-15.21] /_t/publish/values with a key of read and of push is T9104, and a value of 20 MB is T0003', async (t) => {
  const { server, to } = await published(t)
  for (const rights of [['read'], ['push'], ['read', 'push'], ['bundle']]) {
    const { key } = server.key(rights)
    for (const body of [{ kind: 'secret', name: 'SMTP_URL', value: 'v' }, { list: true }]) {
      const answered = await sent(server, '/_t/publish/values', body, key)
      assert.equal(Object(answered.answer.error).code, 'T9104', `${rights}: ${JSON.stringify(answered.answer)}`)
    }
  }
  const large = await stated(server, '/_t/publish/values', to.key, 20 * 1_048_576)
  assert.equal(JSON.parse(large).error.code, 'T0003', large)
  const listed = await sent(server, '/_t/publish/values', { list: true }, to.key)
  assert.deepEqual(Object(listed.answer.value).secrets, [], 'nothing was set')
})

test('[05-15.22] /_t/publish with a list of files in which a path climbs out, or that names one path twice, is refused', async (t) => {
  const { server, here, to } = await published(t)
  const before = running(server)
  here.edit(functions, ".limit(input('limit'))", '.limit(50)')
  const next = await bundleOf(here, join(here.project, '..', 'next'))
  const blobs = [...next.files.values()]
  const entries = [...next.files].map(([path, bytes]) => `${JSON.stringify(path)}:${JSON.stringify(print(bytes))}`)
  const description = print(next.files.get('description.json') ?? new Uint8Array())
  for (const climbing of ['../outside.js', 'server/../../outside.js', '/outside.js', 'C:/outside.js']) {
    const answer = await sentByHand(
      server,
      to.key,
      next.version,
      blobs,
      `{${[...entries, `"${climbing}":"${description}"`].join(',')}}`,
    )
    assert.equal(answer.ok, false, `${climbing}: ${JSON.stringify(answer)}`)
  }
  const twice = await sentByHand(
    server,
    to.key,
    next.version,
    blobs,
    `{${[...entries, `"description.json":"${description}"`].join(',')}}`,
  )
  assert.equal(twice.ok, false, `a path named twice: ${JSON.stringify(twice)}`)
  assert.equal(running(server), before)
})

test('[05-15.24] --back sent twice goes to the version of the second parent each time, and by a key of push is T9104', async (t) => {
  const { server, here, to } = await published(t)
  const first = String(running(server))
  here.edit(tables, '    title: text({ min: 1, max: 80 }),', '    title: text({ min: 1, max: 90 }),')
  await here.save()
  const second = await publish({ project: here.project, history: here.history, to, fetch: fetched })
  here.edit(tables, '    title: text({ min: 1, max: 90 }),', '    title: text({ min: 1, max: 100 }),')
  await here.save()
  await publish({ project: here.project, history: here.history, to, fetch: fetched })
  const pusher = server.key(['read', 'push'])
  const pushed = await sent(server, '/_t/publish', { back: true }, pusher.key)
  assert.equal(Object(pushed.answer.error).code, 'T9104')
  const once = await publish({ project: here.project, history: here.history, to, fetch: fetched, back: true })
  assert.equal(once.version, second.version)
  assert.equal(running(server), second.version)
  const twice = await publish({ project: here.project, history: here.history, to, fetch: fetched, back: true })
  assert.equal(twice.version, first)
  assert.equal(running(server), first)
})
