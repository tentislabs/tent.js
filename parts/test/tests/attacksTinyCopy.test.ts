import assert from 'node:assert/strict'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import type { TestApp, TestBrowser } from '../index.ts'
import { stormed } from './storms.ts'

const marked = 'limits: { anyonePerMinute: 100000, callerPerMinute: 100000, screensPerMinute: 100000 },'

// The screen that shows a picture by the id its address holds.
const photo = `
export const photoScreen = screen('photoScreen', {
  path: '/photo/:id',
  access: 'anyone',
  view: ({ params }) => <Image src={params.id} alt="A photo" width={4} height={4} />,
})
`

// A text that only the tiny copy of the test holds, so that a page that holds it is found by it.
const tiny = 'data:image/webp;base64,VGhlVGlueUNvcHlPZk1heWE='

async function signedIn(app: TestApp, email: string): Promise<TestBrowser> {
  const browser = app.browser()
  assert.deepEqual(await browser.call('signIn', { email }), { ok: true, caller: 'changed' })
  return browser
}

test('[05-10.35] a screen that shows a picture by an id from its address, asked with the id of a file the caller may not download, holds no tiny copy of it', async (t) => {
  const { app, dataFolder } = await stormed(t, 'filed', {
    change: [
      ['tent.ts', marked, marked.replace(' },', ', filesPerMinute: 100000, uploadsPerMinute: 100000 },')],
      ['screens.tsx', "import { screen } from 'tentjs/ui'", `import { Image, screen } from 'tentjs/ui'\n${photo}`],
    ],
  })
  const [maya, omar] = [await signedIn(app, 'maya@example.com'), await signedIn(app, 'omar@example.com')]
  const bytes = new Uint8Array(64)
  bytes.set([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 4, 0, 0, 0, 4,
  ])
  const wire = await maya.upload(bytes, { name: 'dot.png', kind: 'image/png' })
  assert.equal(wire.ok, true, JSON.stringify(wire))
  const id = String(Object(wire.value).id)
  // The tiny copy is laid into the row of the file as the resizer would make it, which no test computer need hold.
  const db = new DatabaseSync(join(dataFolder, 'data.db'))
  try {
    db.prepare('UPDATE "_t_files" SET "tiny" = ? WHERE "id" = ?').run(tiny, id)
  } finally {
    db.close()
  }
  // The caller who may have the file is drawn its tiny copy: the test sees the copy where it may be.
  const own = await maya.page(`/photo/${id}`)
  assert.equal(own.status, 200)
  assert.ok(own.html.includes(tiny), 'the page of the one who may have the file holds no tiny copy')
  // Another user, and a visitor, are drawn the screen with nothing of the file.
  for (const [who, browser] of [
    ['another user', omar],
    ['a visitor', app.browser()],
  ] as const) {
    const page = await browser.page(`/photo/${id}`)
    assert.equal(page.status, 200, who)
    assert.equal(page.html.includes(tiny), false, `the page of ${who} holds the tiny copy`)
    assert.equal(page.html.includes('VGhlVGlueUNvcHlPZk1heWE'), false, `the page of ${who} holds the tiny copy`)
  }
})
