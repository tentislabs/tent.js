import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { appIn } from './desks.ts'
import { copyOf } from './projects.ts'
import { resizerStandIn, standIn } from './standIns.ts'

test('[22-4] the scaled copies of a picture go with its bytes: a file that is removed leaves no copy in cache/img', async (t) => {
  // A resizer stands in for the one that is fetched, so that the door fetches nothing.
  standIn(t, 'sharp', resizerStandIn)
  const folder = copyOf(t, 'filed')
  const file = join(folder, 'tent.ts')
  const marked = 'limits: { anyonePerMinute: 100000, callerPerMinute: 100000, screensPerMinute: 100000 },'
  writeFileSync(
    file,
    // The pictures of the tests are small: the door scales them to a width they pass.
    readFileSync(file, 'utf8').replace(
      marked,
      `${marked.replace(' },', ', filesPerMinute: 100000, uploadsPerMinute: 1000 },')} images: { widths: [32] },`,
    ),
  )
  const { app, dataFolder } = await appIn(t, folder)
  const maya = app.browser()
  assert.deepEqual(await maya.call('signIn', { email: 'maya@example.com' }), { ok: true, caller: 'changed' })
  const bytes = new Uint8Array(readFileSync(join(import.meta.dirname, 'media', 'assets', 'scene.png')))
  const uploaded = await maya.upload(bytes, { name: 'scene.png' })
  assert.equal(uploaded.ok, true, JSON.stringify(uploaded))
  const id = String(Object(uploaded.value).id)
  const fingerprint = createHash('sha256').update(bytes).digest('hex')
  const cache = join(dataFolder, 'cache', 'img')
  const copies = (): string[] =>
    existsSync(cache) ? readdirSync(cache).filter((one) => one.startsWith(fingerprint)) : []
  // The first asking may find the resizer not there yet, and is answered the picture as it is.
  for (let tries = 0; tries < 40 && !copies().length; tries++) {
    const shown = await maya.request('GET', `/_t/img/${id}?w=32`)
    await shown.arrayBuffer()
    assert.equal(shown.status, 200)
    if (!copies().length) await new Promise((done) => setTimeout(done, 250))
  }
  assert.ok(copies().length > 0, 'the image door keeps a scaled copy')
  const removed = await maya.call('removeFile', { id })
  assert.equal(Reflect.get(Object(removed), 'ok'), true, JSON.stringify(removed))
  assert.deepEqual(copies(), [], 'a scaled copy of a removed file is kept in the cache')
})
