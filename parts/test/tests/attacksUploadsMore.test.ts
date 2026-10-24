import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import type { TestApp } from '../index.ts'
import { appIn } from './desks.ts'
import { copyOf } from './projects.ts'
import type { S3StandIn } from './s3StandIn.ts'
import { s3StandIn } from './s3StandIn.ts'

type Answer = Record<string, unknown>
type Browser = ReturnType<TestApp['browser']>

const valueOf = async (response: Response): Promise<Answer> => Object(Object(await response.json()).value)
const codeOf = async (response: Response): Promise<string> => String(Object(Object(await response.json()).error).code)

/** Bytes of a PNG of one pixel by its first bytes, and then some more. */
function pictureBytes(size: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(size)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  for (let i = 8; i < size; i++) bytes[i] = (i * 7) % 251
  return bytes
}

/** The app of the uploads, with its files in a store of the test where one is handed, and its own limits. */
async function uploaded(t: TestContext, o: { store?: S3StandIn; limits?: string } = {}): Promise<TestApp> {
  const project = copyOf(t, 'uploaded')
  const file = join(project, 'tent.ts')
  let text = readFileSync(file, 'utf8')
  if (o.store)
    text = text
      .replace("import { anyone, project } from 'tentjs'", "import { anyone, project, s3, secret } from 'tentjs'")
      .replace(
        'backups: { every: false },',
        `backups: { every: false },\n  files: { store: s3({ url: '${o.store.url}', bucket: 'files', key: secret('storeKey') }) },`,
      )
  if (o.limits) text = text.replace('backups: { every: false },', `backups: { every: false },\n  limits: ${o.limits},`)
  writeFileSync(file, text)
  const { app } = await appIn(t, project)
  if (o.store) await app.values({ kind: 'secret', name: 'storeKey', value: o.store.key })
  return app
}

const begin = async (browser: Browser, size: number, more = '', kind = 'image/png'): Promise<Answer> =>
  valueOf(
    await browser.request('POST', `/_t/files?name=scan.png${more}`, {
      headers: { 'upload-length': String(size), 'content-type': kind, 'content-length': '0' },
    }),
  )

test('[45-19.6] a resumed upload is refused to another caller and another visitor who name its id, as an id that names nothing is, and goes on for its own caller', async (t) => {
  const app = await uploaded(t)
  const maya = app.browser({ as: await app.user({ name: 'Maya', roles: [] }) })
  const bytes = pictureBytes(20_000)
  const begun = await begin(maya, bytes.length)
  const at = `/_t/files?upload=${String(begun.upload)}`
  const strangers = [app.browser({ as: await app.user({ name: 'Bob', roles: [] }) }), app.browser(), app.browser()]
  const nothing = await codeOf(
    await maya.request('POST', `/_t/files?upload=${'0'.repeat(32)}`, { headers: { 'content-length': '0' } }),
  )
  for (const stranger of strangers) {
    assert.equal(await codeOf(await stranger.request('POST', at, { headers: { 'content-length': '0' } })), nothing)
    assert.equal(
      await codeOf(
        await stranger.request('POST', at, {
          headers: { 'upload-offset': '0', 'content-length': String(bytes.length) },
          body: bytes,
        }),
      ),
      nothing,
    )
  }
  const done = await valueOf(
    await maya.request('POST', at, {
      headers: { 'upload-offset': '0', 'content-length': String(bytes.length) },
      body: bytes,
    }),
  )
  assert.equal(done.size, bytes.length, 'nothing of the strangers was taken into it')
})

test('[45-19.6] an upload straight to a store is taken in by its own caller alone', async (t) => {
  const store = await s3StandIn(t)
  const app = await uploaded(t, { store })
  const maya = app.browser({ as: await app.user({ name: 'Maya', roles: [] }) })
  const bytes = pictureBytes(3_000)
  const begun = await begin(maya, bytes.length, '&direct')
  await fetch(String(begun.address), {
    method: 'PUT',
    headers: { 'content-length': String(bytes.length), 'content-type': 'image/png' },
    body: bytes,
  })
  const at = `/_t/files?upload=${String(begun.upload)}`
  const bob = app.browser({ as: await app.user({ name: 'Bob', roles: [] }) })
  assert.equal(await codeOf(await bob.request('POST', at, { headers: { 'content-length': '0' } })), 'T0001')
  const done = await valueOf(await maya.request('POST', at, { headers: { 'content-length': '0' } }))
  assert.equal(done.size, bytes.length)
})

test('[45-19.7] an upload straight to a store that states a picture and sends a text is not taken in', async (t) => {
  const store = await s3StandIn(t)
  const app = await uploaded(t, { store })
  const maya = app.browser({ as: await app.user({ name: 'Maya', roles: [] }) })
  const text = new TextEncoder().encode('<html><script>alert(1)</script></html>'.padEnd(600, ' '))
  const begun = await begin(maya, text.length, '&direct')
  await fetch(String(begun.address), {
    method: 'PUT',
    headers: { 'content-length': String(text.length), 'content-type': 'image/png' },
    body: text,
  })
  const answer = await maya.request('POST', `/_t/files?upload=${String(begun.upload)}`, {
    headers: { 'content-length': '0' },
  })
  assert.equal(await codeOf(answer), 'T0002')
})

test('[45-19.7] an upload sent in parts is held to the most bytes an upload takes, as one sent whole is', async (t) => {
  const app = await uploaded(t, { limits: "{ uploadSize: '4 KB' }" })
  const maya = app.browser({ as: await app.user({ name: 'Maya', roles: [] }) })
  const bytes = pictureBytes(12_000)
  const whole = await maya.request('POST', '/_t/files?name=big.png', {
    headers: { 'content-length': String(bytes.length), 'content-type': 'image/png' },
    body: bytes,
  })
  assert.notEqual(whole.status, 200, 'sent whole it is refused')
  const begun = await maya.request('POST', '/_t/files?name=big.png', {
    headers: { 'upload-length': String(bytes.length), 'content-type': 'image/png', 'content-length': '0' },
  })
  const id = String(Object(Object(await begun.json()).value).upload)
  let last: Answer = {}
  if (begun.status === 200)
    for (let offset = 0; offset < bytes.length; offset += 3_000) {
      const part = bytes.slice(offset, offset + 3_000)
      last = Object(
        await (
          await maya.request('POST', `/_t/files?upload=${id}`, {
            headers: { 'upload-offset': String(offset), 'content-length': String(part.length) },
            body: part,
          })
        ).json(),
      )
      if (last.ok !== true) break
    }
  assert.notEqual(Object(last.value).size, bytes.length, 'sent in parts it is refused too')
})

test('[45-19.8] a signed address for a time whose text is changed in one sign, or that is used after its file was removed and the same bytes uploaded again, opens nothing', async (t) => {
  const app = await uploaded(t)
  const maya = app.browser({ as: await app.user({ name: 'Maya', roles: [] }) })
  const bytes = pictureBytes(2_000)
  const loose = String(Object(await maya.upload(bytes, { name: 'loose.png' })).value?.id)
  const link = String(Object(await maya.call('shareScan', { scan: loose, minutes: 10 })).value)
  const nobody = app.browser()
  assert.equal((await nobody.request('GET', link)).status, 200)
  const last = link.at(-1) === 'A' ? 'B' : 'A'
  assert.equal((await nobody.request('GET', link.slice(0, -1) + last)).status, 404)
  await maya.call('dropScan', { scan: loose })
  const again = String(Object(await maya.upload(bytes, { name: 'loose.png' })).value?.id)
  assert.equal((await nobody.request('GET', link)).status, 404)
  assert.equal((await nobody.request('GET', link.replace(loose, again))).status, 404)
})
