import assert from 'node:assert/strict'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { browserEngines, inBrowser } from '../../../rig/browser.ts'
import type { Served } from './served.ts'
import { complaintsOf, served } from './served.ts'
import { sessionIn } from './sessionIn.ts'

// The project of the board is built and served once for the tests of this file that write no row.
let common: Promise<Served> | undefined
const board = (): Promise<Served> => {
  common ??= served('personal')
  return common
}

/** How many times the app read a query, as its log of calls holds it: each draw of the part that reads it counts. */
function readsOf(at: Served, name: string): number {
  const log = new DatabaseSync(join(at.dataFolder, 'logs.db'), { readOnly: true })
  try {
    return Number(Object(log.prepare('SELECT count(*) AS n FROM calls WHERE name = ?').get(name)).n)
  } finally {
    log.close()
  }
}

/** Waits until the log holds what the engine wrote: it writes it after it answered. */
const written = () => new Promise((done) => setTimeout(done, 150))

/** The id of the user of the seed whose mail address starts with that name. */
async function idOf(at: Served, name: string): Promise<string> {
  const rows: unknown = await at.app.read({ from: 'users' }, { as: 'system' })
  const found = (Array.isArray(rows) ? rows : []).find((row) => String(Object(row).email).startsWith(`${name}@`))
  assert.ok(found, `the seed holds ${name}`)
  return String(Object(found).id)
}

/** The cookie of a browser that is the user of the seed of that name, by a session that the test made. */
async function signedIn(at: Served, name: string): Promise<string> {
  return at.app.session(await idOf(at, name))
}

/** What a browser is sent for an address, piece by piece as it arrives, with the headers. */
async function piecesOf(
  address: string,
  cookie?: string,
): Promise<{ status: number; pieces: string[]; cache: string | null }> {
  const answer = await fetch(address, { headers: { accept: 'text/html', ...(cookie ? { cookie } : {}) } })
  const reader = answer.body?.getReader()
  assert.ok(reader)
  const pieces: string[] = []
  const words = new TextDecoder()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    pieces.push(words.decode(value, { stream: true }))
  }
  return { status: answer.status, pieces, cache: answer.headers.get('cache-control') }
}

/** The text that a document shows, without its tags. */
const shownText = (html: string): string =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<template[\s\S]*?<\/template>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')

test('[32-17] a cached screen with a personal header is drawn once for its shared part across a stranger and two signed-in users, and each is sent its own header in the same answer', async () => {
  const at = await board()
  const ada = await signedIn(at, 'ada')
  const bo = await signedIn(at, 'bo')
  const stranger = await piecesOf(`${at.address}/`)
  const forAda = await piecesOf(`${at.address}/`, ada)
  const forBo = await piecesOf(`${at.address}/`, bo)
  await written()
  // The shared part was drawn once, for the three; the header of each was drawn for each.
  assert.equal(readsOf(at, 'allNotes'), 1)
  assert.equal(readsOf(at, 'headerNotes'), 3)
  const named = { ada: await idOf(at, 'ada'), bo: await idOf(at, 'bo') }
  for (const [who, sent] of [
    ['a stranger', stranger],
    [named.ada, forAda],
    [named.bo, forBo],
  ] as const) {
    assert.equal(sent.status, 200, who)
    assert.equal(sent.cache, 'no-store', who)
    // The first piece is the shared part as the cache holds it: the same for all three, with no header of anyone.
    assert.equal(sent.pieces[0], stranger.pieces[0], who)
    assert.ok(shownText(sent.pieces[0]).includes('Board of 1 notes'), who)
    assert.ok(shownText(sent.pieces[0]).includes('Header coming'), who)
    assert.ok(!sent.pieces[0].includes('Header of'), who)
    // The header of this visitor follows in the same answer, and no header of another.
    const whole = sent.pieces.join('')
    assert.ok(shownText(whole).includes(`Header of ${who}, 1 seen`), `${who}: ${whole}`)
    for (const other of ['a stranger', named.ada, named.bo].filter((one) => one !== who))
      assert.ok(!whole.includes(`Header of ${other}`), `${who} is sent the header of ${other}`)
    // A component of code that states `personal` is drawn for each visitor too.
    assert.ok(!sent.pieces[0].includes('Welcome'), who)
    assert.ok(whole.includes(`Welcome, ${who === 'a stranger' ? 'stranger' : who}`), who)
    assert.match(whole, /<\/html>\n$/)
  }
  // What the page record says of its user is the visitor's own, as the header was drawn.
  assert.ok(forAda.pieces.join('').includes(`"user":{"id":"${named.ada}"`))
})

test('[32-17] a write to a table that the shared part read drops it, and the next visitor is drawn afresh', async () => {
  const at = await served('personal')
  await piecesOf(`${at.address}/`)
  await piecesOf(`${at.address}/`)
  await written()
  assert.equal(readsOf(at, 'allNotes'), 1)
  await at.app.call('addNote', { title: 'Second note' }, { as: { kind: 'system' } })
  const after = await piecesOf(`${at.address}/`)
  await written()
  assert.equal(readsOf(at, 'allNotes'), 2)
  assert.ok(shownText(after.pieces.join('')).includes('Board of 2 notes'))
  assert.ok(shownText(after.pieces.join('')).includes('Header of a stranger, 2 seen'))
})

test('[32-17] with public: true the answer leaves with the shared part alone, and the header is asked once the page lives', async () => {
  const at = await board()
  for (const time of ['drawn', 'kept']) {
    const sent = await piecesOf(`${at.address}/public`)
    assert.equal(sent.status, 200, time)
    assert.match(String(sent.cache), /^public, max-age=0, s-maxage=300$/, time)
    const whole = sent.pieces.join('')
    assert.ok(shownText(whole).includes('Board of 1 notes'), whole)
    assert.ok(!whole.includes('Header of'), whole)
    assert.ok(!/data-t-wait|data-t-part|Header coming/.test(whole), whole)
    assert.match(whole, /<\/html>\n$/)
  }
  // A signed-in visitor's answer leaves as no copy for a cache outside, so it is the shared part with her header.
  const ada = await piecesOf(`${at.address}/public`, await signedIn(at, 'ada'))
  assert.equal(ada.cache, 'no-store')
  assert.ok(!ada.pieces[0].includes('Header of'))
  assert.ok(shownText(ada.pieces.join('')).includes(`Header of ${await idOf(at, 'ada')}, 1 seen`))
  for (const engine of browserEngines)
    await inBrowser(engine, async (page) => {
      const said = `in ${engine}`
      // The page asks the header's query once it lives: by a read, or by watching it over the live connection.
      const asked: string[] = []
      page.on('request', (request) => {
        if (request.url().includes('/_t/read/headerNotes')) asked.push(request.url())
      })
      page.on('websocket', (socket) =>
        socket.on('framesent', (frame) => {
          if (String(frame.payload).includes('"headerNotes"')) asked.push(String(frame.payload))
        }),
      )
      await page.goto(`${at.address}/public`)
      await page.locator('#tent[data-t-alive]').waitFor()
      await page.getByRole('heading', { name: 'Header of a stranger, 1 seen' }).waitFor()
      assert.ok(asked.length >= 1, said)
    })
})

test('[32-17] in the three browsers a signed-in visitor of the kept screen comes alive with their own header and greeting, and the page is theirs', async () => {
  const at = await board()
  const ada = await idOf(at, 'ada')
  for (const engine of browserEngines)
    await inBrowser(engine, async (page) => {
      const said = `in ${engine}`
      const complaints = complaintsOf(page)
      await sessionIn(page, at.address, at.app.session(ada))
      await page.goto(`${at.address}/`)
      await page.locator('#tent[data-t-alive]').waitFor()
      await page.getByRole('heading', { name: `Header of ${ada}, 1 seen` }).waitFor()
      await page.getByText(`Welcome, ${ada}`).waitFor()
      assert.equal(await page.locator('template[data-t-wait], [data-t-part]').count(), 0, said)
      assert.equal(await page.getByText('Header coming').count(), 0, said)
      assert.deepEqual(complaints, [], said)
    })
})
