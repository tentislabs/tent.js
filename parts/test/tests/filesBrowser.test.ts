import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import type { Page } from '../../../rig/browser.ts'
import { browserEngines, inBrowser } from '../../../rig/browser.ts'
import { servedLive } from './living.ts'

const system = { kind: 'system' } as const

/** A second of silence as a sound file: the head of a WAV file, and its samples. */
function sound(): Uint8Array {
  const samples = 8000
  const bytes = Buffer.alloc(44 + samples)
  bytes.write('RIFF', 0, 'latin1')
  bytes.writeUInt32LE(36 + samples, 4)
  bytes.write('WAVEfmt ', 8, 'latin1')
  bytes.writeUInt32LE(16, 16)
  bytes.writeUInt16LE(1, 20)
  bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(8000, 24)
  bytes.writeUInt32LE(8000, 28)
  bytes.writeUInt16LE(1, 32)
  bytes.writeUInt16LE(8, 34)
  bytes.write('data', 36, 'latin1')
  bytes.writeUInt32LE(samples, 40)
  bytes.fill(128, 44)
  return new Uint8Array(bytes)
}

/** The first bytes of a WebM film: its mark, and the head that names its kind. */
const film = (): Uint8Array =>
  new Uint8Array([
    0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01, 0x42, 0xf2, 0x81, 0x04, 0x42, 0xf3,
    0x81, 0x08, 0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d,
  ])

const paper =
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n'

const script = '<!doctype html><html><body><script>document.title = "the script ran"</script>hello</body></html>'

/**
 * Opens an address in a page, and answers whether the browser shows it in place: false where it starts a download.
 * With `plays`, the address is a sound or a film, which a page that shows it holds as the element that plays it.
 */
async function shown(page: Page, address: string, plays = false): Promise<boolean> {
  // A download leaves the page on the document before it: a look for the element that plays starts from an empty
  // one, so the player of the look before is never read as this one's.
  if (plays) await page.goto('about:blank')
  const download = page.waitForEvent('download', { timeout: plays ? 15_000 : 3000 }).then(
    () => true,
    () => false,
  )
  // An engine says that a download starts by failing the opening, by telling of the download, or by both.
  const opened = await page.goto(address).then(
    () => true,
    () => false,
  )
  if (!opened || !plays) return opened && !(await download)
  // A slow computer tells of a download late: what decides is the download or the element, whichever comes first.
  // The page itself is asked for the element: a locator of the driver does not see into the document that WebKit
  // makes of a sound from another site.
  const playing = (async (): Promise<boolean> => {
    for (const until = performance.now() + 15_000; performance.now() < until; ) {
      const found = await page.evaluate(() => document.querySelector('video, audio') !== null).catch(() => false)
      if (found) return true
      await new Promise((done) => setTimeout(done, 100))
    }
    return false
  })()
  return new Promise((done) => {
    void download.then((started) => started && done(false))
    void playing.then(done)
  })
}

/**
 * A server of this computer that answers the same bytes with their kind and with no policy at all: what an engine
 * does with a kind by itself, to hold what it does under the locked policy against.
 */
async function plainly(
  t: TestContext,
  files: Record<string, [kind: string, bytes: Uint8Array | string]>,
): Promise<string> {
  const server = createServer((request, answer) => {
    const [kind, bytes] = files[request.url ?? ''] ?? ['text/plain', '']
    answer.writeHead(200, { 'content-type': kind, 'x-content-type-options': 'nosniff' })
    answer.end(bytes)
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  t.after(() => void server.close())
  return `http://127.0.0.1:${Object(server.address()).port}`
}

test('[22-18] [22-13] in the three browser engines a sound and a film that are opened by their address are shown wherever the engine shows their kind at all, an uploaded HTML file is a download and runs no script, and whether a PDF is shown is written down', async (t) => {
  const at = await servedLive(t, { project: 'filed' })
  const users = Object(await at.app.read({ from: 'users' }, { as: system }))
  const maya = { kind: 'user' as const, user: { id: String(users[0].id), roles: [] } }
  // Each file is held by a row that everyone may read, so a browser with no session opens it.
  const held = async (bytes: Uint8Array | string, name: string, kind?: string): Promise<string> => {
    const id = String(
      await at.app.call(
        'putBytes',
        { base64: Buffer.from(bytes).toString('base64'), name, ...(kind === undefined ? {} : { kind }) },
        { as: maya },
      ),
    )
    await at.app.call('post', { title: name, picture: id }, { as: maya })
    return `${at.origin}/_t/files/${id}`
  }
  const [wav, webm, pdf, html] = [
    await held(sound(), 'a.wav'),
    await held(film(), 'a.webm'),
    await held(paper, 'a.pdf'),
    await held(script, 'a.png', 'image/png'),
  ]
  // Every answer of a file carries the policy that lets it act as no page of the app, and the kind that the bytes say.
  for (const [address, kind] of [
    [wav, 'audio/wav'],
    [webm, 'video/webm'],
    [pdf, 'application/pdf'],
    [html, 'text/html'],
  ]) {
    const answer = await fetch(address)
    await answer.arrayBuffer()
    assert.equal(answer.headers.get('content-type'), kind, address)
    assert.equal(answer.headers.get('content-security-policy'), "default-src 'none'; sandbox")
  }
  const plain = await plainly(t, {
    '/a.wav': ['audio/wav', sound()],
    '/a.webm': ['video/webm', film()],
    '/a.pdf': ['application/pdf', paper],
  })
  const seen: Record<string, Record<string, boolean>> = {}
  for (const engine of browserEngines)
    await inBrowser(engine, async (page) => {
      seen[engine] = {}
      for (const [what, address] of Object.entries({ wav, webm, pdf })) {
        // The locked policy keeps no engine from showing what it shows of that kind with no policy at all.
        const plays = what !== 'pdf'
        const [locked, free] = [await shown(page, address, plays), await shown(page, `${plain}/a.${what}`, plays)]
        if (what !== 'pdf') assert.ok(locked || !free, `${engine} shows a .${what} under the policy as it does without`)
        seen[engine][what] = locked
      }
      // The file whose bytes are HTML is sent as a download, whatever it was named: its script never runs.
      assert.equal(await shown(page, html), false, `${engine} downloads an uploaded HTML file`)
      assert.notEqual(await page.title(), 'the script ran', engine)
    })
  // A film is shown in place by every engine, and a sound by each engine that shows a sound of that kind at all.
  for (const engine of browserEngines) assert.equal(seen[engine].webm, true, `${engine} shows a film in place`)
  assert.ok(
    browserEngines.some((engine) => seen[engine].wav),
    'an engine shows a sound in place',
  )
  // Written down, and held to nothing: whether each engine shows a PDF, and a sound, under the locked policy.
  t.diagnostic(`what each engine shows in place, opened by its address: ${JSON.stringify(seen)}`)
})
