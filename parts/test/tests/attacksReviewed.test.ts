import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import type { Served } from './served.ts'
import { served } from './served.ts'

// The attacks of `05`, sections 4 and 9, that the reviewer of the step wrote beside those of its builder.

/** How many times the app read a query, as its log of calls holds it. */
function readsOf(at: Served, name: string): number {
  const log = new DatabaseSync(join(at.dataFolder, 'logs.db'), { readOnly: true })
  try {
    return Number(Object(log.prepare('SELECT count(*) AS n FROM calls WHERE name = ?').get(name)).n)
  } finally {
    log.close()
  }
}

// The engine writes its log after it answered.
const written = () => new Promise((done) => setTimeout(done, 150))

/** Writes a file of a copy of a project anew, with one text of it put in the place of another. */
const replaced = (folder: string, file: string, from: string, to: string): void => {
  const path = join(folder, file)
  const text = readFileSync(path, 'utf8')
  assert.ok(text.includes(from), `${file} holds ${from}`)
  writeFileSync(path, text.replace(from, to))
}

test('[05-9.1] a thousand made-up values of a text state and a thousand names that are no state push nothing out of the cache of a screen', async () => {
  // Two answers of one screen are all that its share of the cache holds: one more that was kept would push one out.
  const at = await served('cached', {
    change: (folder) =>
      replaced(folder, 'tent.ts', 'screensPerMinute: 100000 }', 'screensPerMinute: 100000, pageCachePerScreen: 2 }'),
  })
  const get = async (path: string): Promise<void> => void (await (await fetch(`${at.address}${path}`)).text())
  await get('/news')
  await get('/news?tab=new')
  await written()
  const reads = readsOf(at, 'allNews')
  for (let k = 0; k < 1000; k++) {
    await get(`/news?search=made${k}`)
    await get(`/news?made${k}=1`)
  }
  await written()
  const between = readsOf(at, 'allNews')
  // The two kept answers are still kept: asking for them draws nothing.
  await get('/news')
  await get('/news?tab=new')
  await written()
  assert.equal(readsOf(at, 'allNews'), between)
  assert.ok(between > reads)
})

test('[05-4.18] a form with a hidden address that leads out of the app however it is written is T0002', async () => {
  const at = await served('formed')
  for (const to of [
    '/\\evil.example',
    '/%5Cevil.example',
    '/%2F%2Fevil.example',
    '/%2f/evil.example',
    '/\t/evil.example',
    '/homes/%2F%2Fevil.example',
    '/homes/%5Cevil.example',
    'https://evil.example/join',
  ]) {
    const answer = await fetch(`${at.address}/_t/form/join`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ owner: 'Eve', city: 'X', 't-form': 'join', 't-version': '', 't-at': to }).toString(),
    })
    assert.equal(answer.headers.get('location'), null, to)
    assert.equal(Object(await answer.json()).error.code, 'T0002', to)
  }
  // An owner that the visitor typed is worked into the address of then: one that would lead out leads to t-at.
  const sent = await fetch(`${at.address}/_t/form/join`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      owner: '/evil.example',
      secret: 's',
      city: 'X',
      't-form': 'join',
      't-version': '',
      't-at': '/join',
    }).toString(),
  })
  assert.equal(sent.status, 303)
  assert.equal(sent.headers.get('location'), '/join')
})

test('[05-4.19] a form posted with the cookie of a visitor from a site that api.origins lists is T0004: the Origin of a form must be the app own', async () => {
  const at = await served('formed', {
    change: (folder) =>
      replaced(folder, 'tent.ts', "title: 'Shop',", "title: 'Shop',\n  api: { origins: ['https://partner.example'] },"),
  })
  const answer = await fetch(`${at.address}/_t/form/join`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      cookie: 'tent_session.shop=a-planted-session',
      origin: 'https://partner.example',
    },
    body: new URLSearchParams({
      owner: 'Eve',
      city: 'X',
      't-form': 'join',
      't-version': '',
      't-at': '/join',
    }).toString(),
  })
  assert.equal(Object(await answer.json()).error.code, 'T0004')
})

test('[05-9.14] /_t/screen of a public screen says no-store, also when the engine keeps the page and sends the page itself as public', async () => {
  const at = await served('cached')
  const html = await (await fetch(`${at.address}/shared`)).text()
  const version = String(JSON.parse(/id="tent-page">(.*?)<\/script>/s.exec(html)?.[1] ?? '{}').version)
  assert.equal((await fetch(`${at.address}/shared`)).headers.get('cache-control'), 'public, max-age=0, s-maxage=60')
  for (let k = 0; k < 2; k++) {
    const again = await fetch(`${at.address}/_t/screen?path=%2Fshared&version=${version}`)
    assert.equal(again.status, 200)
    assert.equal(again.headers.get('cache-control'), 'no-store')
    assert.equal(Object(await again.json()).value.screen, 'sharedScreen')
  }
})
