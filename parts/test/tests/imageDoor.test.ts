import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { crc32, deflateSync } from 'node:zlib'
import type { TestApp, TestBrowser } from '../index.ts'
import { testApp } from '../index.ts'
import { closing, copyOf } from './projects.ts'
import { resizerStandIn, standIn } from './standIns.ts'

/** The project of the files, with a count of files that a test does not run into. */
const opened = (t: test.TestContext): Promise<TestApp> => openedWith(t, '')

/** The project of the files, with a line of its own in `project`. */
async function openedWith(t: test.TestContext, line: string): Promise<TestApp> {
  const folder = copyOf(t, 'filed')
  const file = join(folder, 'tent.ts')
  const marked = 'limits: { anyonePerMinute: 100000, callerPerMinute: 100000, screensPerMinute: 100000 },'
  const written = readFileSync(file, 'utf8')
  assert.ok(written.includes(marked))
  writeFileSync(
    file,
    written.replace(marked, `${marked.replace(' },', ', filesPerMinute: 100000, uploadsPerMinute: 1000 },')}${line}`),
  )
  const app = await testApp({ folder })
  closing(t, () => app.close())
  return app
}

async function signedIn(app: TestApp, email: string): Promise<TestBrowser> {
  const browser = app.browser()
  assert.deepEqual(await browser.call('signIn', { email }), { ok: true, caller: 'changed' })
  return browser
}

/** One part of a PNG picture: its length, its name, its bytes and their check. */
function part(name: string, data: Uint8Array): Uint8Array {
  const body = Buffer.concat([Buffer.from(name, 'latin1'), data])
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  body.copy(out, 4)
  out.writeUInt32BE(crc32(body) >>> 0, 8 + data.length)
  return out
}

/** A whole PNG picture of a width and a height, each point of another colour, so that it does not pack small. */
function picture(width: number, height: number): Uint8Array<ArrayBuffer> {
  const head = Buffer.alloc(13)
  head.writeUInt32BE(width, 0)
  head.writeUInt32BE(height, 4)
  head.set([8, 2, 0, 0, 0], 8)
  const lines = Buffer.alloc(height * (1 + width * 3))
  for (let at = 0; at < lines.length; at++) lines[at] = at % (1 + width * 3) === 0 ? 0 : (at * 2654435761) >>> 24
  const mark = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  return new Uint8Array(
    Buffer.concat([
      Buffer.from(mark),
      part('IHDR', head),
      part('IDAT', deflateSync(lines)),
      part('IEND', Buffer.alloc(0)),
    ]),
  )
}

const idOf = (wire: { ok: boolean; value?: unknown }): string => {
  assert.equal(wire.ok, true, JSON.stringify(wire))
  return String(Object(wire.value).id)
}

/** What the image door answers a browser: its status, the code of a refusal, and its headers. */
async function door(browser: TestBrowser, path: string, headers: Record<string, string> = {}) {
  const answer = await browser.request('GET', `/_t/img/${path}`, { headers })
  const kind = answer.headers.get('content-type') ?? ''
  const code = kind.startsWith('application/json') ? String(Object(Object(await answer.json()).error).code) : ''
  const text = code === '' ? Buffer.from(await answer.arrayBuffer()).toString('latin1') : ''
  return { status: answer.status, code, kind, headers: answer.headers, text }
}

test('[22-4] the image door refuses a web address, a width outside the list, no width, a file that is no picture, and tells a caller who may not have a file nothing of it', async (t) => {
  // A resizer stands in for the one that is fetched, so that the door fetches nothing.
  standIn(t, 'sharp', resizerStandIn)
  const app = await opened(t)
  const maya = await signedIn(app, 'maya@example.com')
  const omar = await signedIn(app, 'omar@example.com')
  const id = idOf(await maya.upload(picture(400, 300), { name: 'a.png' }))
  const words = idOf(await maya.upload('only words', { name: 'a.txt', kind: 'text/plain' }))
  for (const [path, what] of [
    [`${encodeURIComponent('https://example.com/a.png')}?w=320`, 'a web address'],
    [`${id}?w=321`, 'another width'],
    [`${id}?w=100000`, 'a width past the list'],
    [`${id}`, 'no width'],
    [`${id}?w=`, 'an empty width'],
    [`${words}?w=320`, 'a file that is no picture'],
  ] as const)
    assert.deepEqual([(await door(maya, path)).code, (await door(maya, path)).status], ['T0002', 400], what)
  // The rule of a download comes first: whoever may not have the file is told the same of a picture and of words.
  assert.deepEqual(
    [(await door(omar, `${id}?w=320`)).code, (await door(omar, `${words}?w=320`)).code],
    ['T0001', 'T0001'],
  )
  // Who it belongs to is answered the picture, under the policy that lets it act as no page of the app.
  const shown = await door(maya, `${id}?w=320`)
  assert.deepEqual(
    [shown.status, shown.headers.get('content-security-policy'), shown.headers.get('x-content-type-options')],
    [200, "default-src 'none'; sandbox", 'nosniff'],
  )
  assert.match(shown.kind, /^image\//)
})

test('[22-4] a browser that takes AVIF is answered AVIF where that is smaller, with Vary: Accept, one that takes neither is answered the kind of the picture, and with no formats every browser is', async (t) => {
  // A resizer stands in for the one that is fetched: it answers a few bytes that name what it was asked.
  standIn(t, 'sharp', resizerStandIn)
  const app = await opened(t)
  const maya = await signedIn(app, 'maya@example.com')
  const id = idOf(await maya.upload(picture(800, 600), { name: 'large.png' }))
  const avif = { accept: 'image/avif,image/webp,image/*' }
  // The door starts the fetch of the resizer and does not wait for it: until it is there, the picture is as it is.
  let taken = await door(maya, `${id}?w=320`, avif)
  for (let i = 0; i < 300 && taken.kind !== 'image/avif'; i++) {
    await new Promise((done) => setTimeout(done, 10))
    taken = await door(maya, `${id}?w=320`, avif)
  }
  assert.deepEqual([taken.kind, taken.headers.get('vary')], ['image/avif', 'Accept'])
  const plain = await door(maya, `${id}?w=320`, { accept: 'image/png' })
  assert.deepEqual([plain.kind, plain.headers.get('vary')], ['image/png', 'Accept'])
  // The resizer was asked for the width, in each kind.
  assert.deepEqual(
    [taken.text, plain.text].map((one) => one.split(' of ')[0]),
    ['avif 320', 'png 320'],
  )

  // With `images: { formats: [] }` every picture keeps its kind, whatever the browser takes.
  const none = await openedWith(t, 'images: { formats: [] },')
  const omar = await signedIn(none, 'omar@example.com')
  const own = idOf(await omar.upload(picture(800, 600), { name: 'large.png' }))
  let kept = await door(omar, `${own}?w=320`, avif)
  for (let i = 0; i < 300 && !kept.text.startsWith('png 320'); i++) {
    await new Promise((done) => setTimeout(done, 10))
    kept = await door(omar, `${own}?w=320`, avif)
  }
  assert.deepEqual([kept.kind, kept.text.split(' of ')[0]], ['image/png', 'png 320'])
})

test('[22-17] an asset through the image door is served with its year and counts on nothing, and one that the description does not name, with .. in it, is not found', async (t) => {
  // A resizer stands in for the one that is fetched, so that the door fetches nothing.
  standIn(t, 'sharp', resizerStandIn)
  const app = await opened(t)
  const visitor = app.browser()
  const file = String(Object(Object(app.description.assets)['dot.png']).file)
  const print = file.split('.').at(-2)
  const served = await door(visitor, `a/dot.png?w=320&v=${print}`)
  assert.deepEqual(
    [served.status, served.kind, served.headers.get('cache-control'), served.headers.get('x-content-type-options')],
    [200, 'image/png', 'public, max-age=31536000, immutable', 'nosniff'],
  )
  for (const [path, what] of [
    [`a/dot.png?w=320&v=000000000000`, 'another fingerprint'],
    [`a/dot.png?w=320`, 'no fingerprint'],
    [`a/none.png?w=320&v=${print}`, 'a name that the description does not hold'],
    [`a/${encodeURIComponent('../tent.ts')}?w=320&v=${print}`, 'a name with .. in it'],
    [`a/${encodeURIComponent('../assets/dot.png')}?w=320&v=${print}`, 'the asset by a path that is walked'],
  ] as const)
    assert.deepEqual([(await door(visitor, path)).code, (await door(visitor, path)).status], ['T0001', 404], what)
  assert.equal((await door(visitor, `a/dot.png?w=7&v=${print}`)).code, 'T0002')
})
