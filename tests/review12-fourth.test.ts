import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { test } from 'node:test'
import { inBrowser } from '../rig/browser.ts'
import { copyOf, result, run } from './rigs-plant.ts'

test('[53-21] in the framework repository, a test file runs again where a file changed that a thread of it read before it waited on a lock and was ended', (t) => {
  const folder = copyOf(t, 'review12-held')
  const first = run(folder)
  assert.equal(first.code, 0, first.out)
  writeFileSync(join(folder, 'data.txt'), 'two\n')
  const second = run(folder)
  assert.equal(result(folder).tests['99-1'], 'failed', second.out)
})

test('[54-4] a context of the kept Chromium that asks for no device reaches no camera, as one of a browser of its own did not', async (t) => {
  // A page of this computer, which is a secure place, so the page may ask for the camera at all.
  const server = createServer((_, answer) => {
    answer.writeHead(200, { 'content-type': 'text/html' })
    answer.end('<!doctype html><title>Camera</title>')
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  t.after(() => server.close())
  const address: AddressInfo | string | null = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  // A call that asks for a device first, as a test of the camera does, and then one that asks for none.
  await inBrowser('chromium', async () => undefined, { device: true })
  const got = await inBrowser('chromium', async (page) => {
    await page.goto(`http://127.0.0.1:${String(port)}/`)
    return page.evaluate(() =>
      navigator.mediaDevices.getUserMedia({ video: true }).then(
        () => 'a camera',
        (error: unknown) => `refused: ${String(Reflect.get(Object(error), 'name'))}`,
      ),
    )
  })
  assert.match(got, /^refused/)
})
