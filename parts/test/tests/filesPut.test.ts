import assert from 'node:assert/strict'
import test from 'node:test'
import type { TestApp, TestBrowser } from '../index.ts'
import { testApp } from '../index.ts'
import { closing, copyOf } from './projects.ts'

/** A browser that signed in as the user of an email. */
async function signedIn(app: TestApp, email: string): Promise<TestBrowser> {
  const browser = app.browser()
  assert.deepEqual(await browser.call('signIn', { email }), { ok: true, caller: 'changed' })
  return browser
}

const bytesOf = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text)
const idOf = (wire: { ok: boolean; value?: unknown }): string => String(Reflect.get(Object(wire.value), 'id'))
const codeOf = (wire: { ok: boolean; error?: { code: string } }): string => (wire.ok ? 'ok' : String(wire.error?.code))

test('[22-16@9a] putting a file into a row is held tighter than downloading it: a caller puts in a file it uploaded, or one that a row it may change holds; a file it may only download is T2104 there', async (t) => {
  const app = await testApp({ folder: copyOf(t, 'filed') })
  closing(t, () => app.close())
  const maya = await signedIn(app, 'maya@example.com')
  const omar = await signedIn(app, 'omar@example.com')
  // Maya's picture stands in a notice that everyone may read: Omar may download it.
  const picture = idOf(await maya.upload(bytesOf('the picture of Maya'), { name: 'a.txt', kind: 'text/plain' }))
  assert.equal(codeOf(await maya.call('post', { title: 'A notice', picture })), 'ok')
  assert.equal((await omar.request('GET', `/_t/files/${picture}`)).status, 200)
  // Omar may not put it into a row of his own.
  assert.equal(codeOf(await omar.call('keepPaper', { title: 'Mine now', paper: picture })), 'T2104')
  // What Omar uploaded himself he puts in, and so a file that a row he may change holds.
  const own = idOf(await omar.upload(bytesOf('the paper of Omar'), { name: 'b.txt', kind: 'text/plain' }))
  const kept = await omar.call('keepPaper', { title: 'His', paper: own })
  assert.equal(codeOf(kept), 'ok')
  assert.equal(codeOf(await omar.call('keepPaper', { title: 'His again', paper: own })), 'ok')
})
