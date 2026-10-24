import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import type { FileStore } from '../../engine/index.ts'
import { folderStore, s3Store } from '../../engine/index.ts'
import type { TestApp } from '../index.ts'
import { appIn } from './desks.ts'
import { copyOf } from './projects.ts'
import type { S3StandIn } from './s3StandIn.ts'
import { s3StandIn } from './s3StandIn.ts'

type Answer = Record<string, unknown>

const valueOf = async (response: Response): Promise<Answer> => Object(Object(await response.json()).value)
const codeOf = async (response: Response): Promise<string> => String(Object(Object(await response.json()).error).code)

/** Bytes that a test knows: a PNG of one pixel, whose kind its first bytes say, and then some more. */
function pictureBytes(size: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(size)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  for (let i = 8; i < size; i++) bytes[i] = (i * 7) % 251
  return bytes
}

/** The app of the uploads, where `store` names a store of the S3 protocol for its files. */
async function uploaded(t: TestContext, store?: S3StandIn): Promise<{ app: TestApp; dataFolder: string }> {
  const project = copyOf(t, 'uploaded')
  if (store) {
    const file = join(project, 'tent.ts')
    writeFileSync(
      file,
      readFileSync(file, 'utf8')
        .replace("import { anyone, project } from 'tentjs'", "import { anyone, project, s3, secret } from 'tentjs'")
        .replace(
          'backups: { every: false },',
          `backups: { every: false },\n  files: { store: s3({ url: '${store.url}', bucket: 'files', key: secret('storeKey') }) },`,
        ),
    )
  }
  const { app, dataFolder } = await appIn(t, project)
  if (store) await app.values({ kind: 'secret', name: 'storeKey', value: store.key })
  return { app, dataFolder }
}

test('[45-8] an upload that is cut off at half goes on from where it stopped, under an id that only its caller names', async (t) => {
  const { app } = await uploaded(t)
  const maya = app.browser({ as: await app.user({ name: 'Maya', roles: [] }) })
  const bytes = pictureBytes(200_000)
  const begun = await valueOf(
    await maya.request('POST', '/_t/files?name=scan.png', {
      headers: { 'upload-length': String(bytes.length), 'content-length': '0' },
    }),
  )
  assert.equal(typeof begun.upload, 'string')
  assert.equal(begun.offset, 0)
  const at = `/_t/files?upload=${String(begun.upload)}`
  // The connection is cut at half: the request states the whole rest, and half of it arrives.
  const cut = await maya.request('POST', at, {
    headers: { 'upload-offset': '0', 'content-length': String(bytes.length) },
    body: bytes.slice(0, 100_000),
  })
  assert.notEqual(cut.status, 200)
  // The caller asks where the upload stands, and goes on from there.
  const where = await valueOf(await maya.request('POST', at, { headers: { 'content-length': '0' } }))
  assert.equal(where.offset, 100_000)
  // Another caller who names the id is refused, and learns nothing of it.
  const other = app.browser({ as: await app.user({ name: 'Bob', roles: [] }) })
  const guessed = await other.request('POST', at, {
    headers: { 'upload-offset': '100000', 'content-length': '1' },
    body: new Uint8Array([1]),
  })
  assert.equal(await codeOf(guessed), 'T0001')
  // An offset that is not where it stands is refused and named.
  const wrong = await maya.request('POST', at, {
    headers: { 'upload-offset': '5', 'content-length': '10' },
    body: bytes.slice(5, 15),
  })
  assert.equal(await codeOf(wrong), 'T0002')
  const done = await valueOf(
    await maya.request('POST', at, {
      headers: { 'upload-offset': '100000', 'content-length': String(bytes.length - 100_000) },
      body: bytes.slice(100_000),
    }),
  )
  assert.equal(done.size, bytes.length)
  assert.equal(done.kind, 'image/png')
  const back = new Uint8Array(await (await maya.request('GET', `/_t/files/${String(done.id)}`)).arrayBuffer())
  assert.deepEqual(back, bytes)
  // The upload is over: its id names nothing any more.
  assert.equal(await codeOf(await maya.request('POST', at, { headers: { 'content-length': '0' } })), 'T0001')
})

test('[45-8] a signed address for a time downloads the file with no sign-in until it ends and not after, is made only by a caller who may download the file, and dies with its file', async (t) => {
  const { app } = await uploaded(t)
  const mayaCaller = await app.user({ name: 'Maya', roles: [] })
  const maya = app.browser({ as: mayaCaller })
  const bytes = pictureBytes(4_000)
  const scan = String(Object(await maya.upload(bytes, { name: 'scan.png', kind: 'image/png' })).value?.id)
  await maya.call('addPaper', { title: 'The scan', scan })
  const link = String(Object(await maya.call('shareScan', { scan, minutes: 10 })).value)
  assert.match(link, new RegExp(`^/_t/files/${scan}\\?l=[A-Za-z0-9_-]+$`))
  const nobody = app.browser()
  assert.equal((await nobody.request('GET', `/_t/files/${scan}`)).status, 404)
  const got = await nobody.request('GET', link)
  assert.equal(got.status, 200)
  assert.deepEqual(new Uint8Array(await got.arrayBuffer()), bytes)
  // A signed address of another file under the text of this one opens nothing.
  const other = String(Object(await maya.upload(pictureBytes(3_000), { name: 'other.png' })).value?.id)
  assert.equal((await nobody.request('GET', link.replace(scan, other))).status, 404)
  // A caller who may not download the file makes no signed address of it.
  const bob = app.browser({ as: await app.user({ name: 'Bob', roles: [] }) })
  assert.equal(String(Object(Object(await bob.call('shareScan', { scan, minutes: 10 })).error).code), 'T0001')
  // Past its end the address opens nothing.
  app.clock.advance('11 minutes')
  assert.equal((await nobody.request('GET', link)).status, 404)
  // A signed address of a file that is removed is dead.
  const loose = String(Object(await maya.upload(pictureBytes(2_000), { name: 'loose.png' })).value?.id)
  const short = String(Object(await maya.call('shareScan', { scan: loose, minutes: 10 })).value)
  assert.equal((await nobody.request('GET', short)).status, 200)
  await maya.call('dropScan', { scan: loose })
  assert.equal((await nobody.request('GET', short)).status, 404)
})

/** The tests of a store of files: what any store must do, held against one. */
async function heldAsFileStore(store: FileStore, what: string): Promise<void> {
  const bytes = pictureBytes(70_000)
  const key = 'ab'.repeat(32)
  const read = async (stream: ReadableStream<Uint8Array>): Promise<Uint8Array> => {
    const parts: Uint8Array[] = []
    for await (const part of stream) parts.push(part)
    return new Uint8Array(Buffer.concat(parts))
  }
  await store.put(key, new Blob([bytes]).stream(), { size: bytes.length, kind: 'image/png' })
  assert.deepEqual(await read(store.get(key)), bytes, `${what}: the bytes as they were put`)
  assert.deepEqual(await read(store.get(key, { from: 10, to: 19 })), bytes.slice(10, 20), `${what}: a range`)
  assert.deepEqual(await read(store.get(key, { from: 69_990 })), bytes.slice(69_990), `${what}: a range to the end`)
  // The same bytes put again are kept once, and the store still answers them.
  await store.put(key, new Blob([bytes]).stream(), { size: bytes.length, kind: 'image/png' })
  assert.deepEqual(await read(store.get(key)), bytes, `${what}: put twice`)
  await store.remove(key)
  await assert.rejects(async () => read(store.get(key)), `${what}: bytes that are gone fail`)
  // A name that is no fingerprint is refused.
  assert.throws(() => store.get('../outside'), `${what}: no path`)
}

test('[45-8] the store of the S3 protocol passes the tests of a store of files, as the folder that ships does, with every request signed', async (t) => {
  const standIn = await s3StandIn(t)
  const [id, secret] = standIn.key.split(':')
  await heldAsFileStore(folderStore(join(copyOf(t, 'uploaded'), 'data')), 'the folder')
  await heldAsFileStore(
    s3Store({ url: standIn.url, bucket: 'files', region: 'us-east-1', keyId: id, keySecret: secret }),
    'the S3 store',
  )
  assert.deepEqual(standIn.refused, [])
  const wrong = s3Store({ url: standIn.url, bucket: 'files', region: 'us-east-1', keyId: id, keySecret: 'not it' })
  await assert.rejects(
    wrong.put('cd'.repeat(32), new Blob([new Uint8Array(3)]).stream(), { size: 3, kind: 'text/plain' }),
    { code: 'T0009' },
  )
})

test('[45-8] an upload straight to a store is answered with an address of the store for that one upload, and is taken in only once the store holds its bytes, which are read for their kind and held to what was stated', async (t) => {
  const store = await s3StandIn(t)
  const { app } = await uploaded(t, store)
  const maya = app.browser({ as: await app.user({ name: 'Maya', roles: [] }) })
  const bytes = pictureBytes(30_000)
  const begun = await valueOf(
    await maya.request('POST', '/_t/files?name=scan.png&direct', {
      headers: { 'upload-length': String(bytes.length), 'content-type': 'image/png', 'content-length': '0' },
    }),
  )
  assert.equal(typeof begun.address, 'string')
  assert.ok(String(begun.address).startsWith(`${store.url}/files/`), String(begun.address))
  const at = `/_t/files?upload=${String(begun.upload)}`
  // Before the store holds the bytes, nothing is taken in.
  assert.equal(await codeOf(await maya.request('POST', at, { headers: { 'content-length': '0' } })), 'T0002')
  // The bytes go to the store, by the address, with the size and the kind that were stated.
  const put = await fetch(String(begun.address), {
    method: 'PUT',
    headers: { 'content-length': String(bytes.length), 'content-type': 'image/png' },
    body: bytes,
  })
  assert.equal(put.status, 200)
  const done = await valueOf(await maya.request('POST', at, { headers: { 'content-length': '0' } }))
  assert.deepEqual([done.size, done.kind], [bytes.length, 'image/png'])
  const back = new Uint8Array(await (await maya.request('GET', `/_t/files/${String(done.id)}`)).arrayBuffer())
  assert.deepEqual(back, bytes)
  // A direct upload that sends another size than it stated is not taken in.
  const second = await valueOf(
    await maya.request('POST', '/_t/files?name=small.png&direct', {
      headers: { 'upload-length': '500', 'content-type': 'image/png', 'content-length': '0' },
    }),
  )
  const other = pictureBytes(400)
  await fetch(String(second.address), {
    method: 'PUT',
    headers: { 'content-length': '400', 'content-type': 'image/png' },
    body: other,
  })
  const refused = await maya.request('POST', `/_t/files?upload=${String(second.upload)}`, {
    headers: { 'content-length': '0' },
  })
  assert.equal(await codeOf(refused), 'T0002')
})
